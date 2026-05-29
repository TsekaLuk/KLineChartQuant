/**
 * Tool executor — the missing link between an MCP schema and a chart
 * mutation actually running.
 *
 * What the LLM does:
 *
 *   1. Read the schemas (registered via `ALL_TOOLS` from `toolSchemas`).
 *   2. Decide which tool to call.
 *   3. Emit a `{ name, args }` call.
 *
 * What this module does next:
 *
 *   4. Look up the schema by `name`.
 *   5. Validate `args` against `inputSchema` (a small JSON-Schema subset —
 *      no `ajv`, no codegen, no async).
 *   6. Look up the controller in the supplied registry (the host wires
 *      it once at app start).
 *   7. Invoke the matching method on that controller.
 *   8. Return a `{ ok, result }` envelope so the LLM can branch on
 *      failure without crashing the agent loop.
 *
 * Safety policy:
 *
 *   - `'readonly'` tools always run.
 *   - `'mutates-state'` tools always run (the LLM is expected to ask
 *     the user before chains of these in chat).
 *   - `'destroys-state'` tools refuse unless `opts.allowDestruction === true`.
 *     The intended pattern: the host shows a confirm dialog, then re-runs
 *     `executeTool` with the flag.
 *
 * This module is intentionally TINY (~200 LOC) and zero-dep. It does not
 * pull in `ajv` or any other JSON-Schema validator — every form we emit
 * from `toolSchemas.ts` is handled directly. New JSON-Schema constructs
 * MUST be added here in lockstep.
 */

import { findTool, ALL_TOOLS } from './toolSchemas'
import type { JsonSchema, McpToolSchema } from './types'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * Host-supplied registry of controllers. Keyed by the prefix of the
 * tool name (e.g. tool `alerts.addRule` looks up `registry['alerts']`).
 *
 * Each controller is typed as `unknown` here — the executor only needs
 * to call `controller[method](args)` via dynamic lookup. Hosts that
 * want compile-time typing should wrap this with their own narrower
 * facade.
 */
export type ControllerRegistry = Readonly<Record<string, unknown>>

export type ToolErrorCode =
    | 'TOOL_NOT_FOUND'
    | 'INVALID_ARGS'
    | 'CONTROLLER_NOT_REGISTERED'
    | 'METHOD_NOT_FOUND'
    | 'DESTRUCTIVE_NOT_CONFIRMED'
    | 'TOOL_THREW'

export type ToolResult =
    | { readonly ok: true; readonly result: unknown }
    | {
        readonly ok: false
        readonly code: ToolErrorCode
        readonly message: string
        /** Underlying exception if the controller method threw. */
        readonly cause?: unknown
    }

export interface ExecuteToolOptions {
    /**
     * Required to run `safety: 'destroys-state'` tools. Default false —
     * the executor refuses with `DESTRUCTIVE_NOT_CONFIRMED` so the host
     * can prompt the user.
     */
    readonly allowDestruction?: boolean
    /**
     * Override the schema registry. Default: the bundled `ALL_TOOLS`.
     * Useful when the host has filtered tools by domain or version.
     */
    readonly tools?: ReadonlyArray<McpToolSchema>
}

// ---------------------------------------------------------------------------
// JSON Schema validator — handles only the subset toolSchemas emits.
// ---------------------------------------------------------------------------

function fail(path: string, msg: string): { ok: false; path: string; msg: string } {
    return { ok: false, path, msg }
}

function ok(): { ok: true } {
    return { ok: true }
}

type ValidationResult = { ok: true } | { ok: false; path: string; msg: string }

function validate(value: unknown, schema: JsonSchema, path: string): ValidationResult {
    if ('oneOf' in schema) {
        const matches = schema.oneOf.filter((s) => validate(value, s, path).ok)
        if (matches.length === 1) return ok()
        return fail(
            path,
            `oneOf: expected exactly 1 match, got ${matches.length}`,
        )
    }
    if ('anyOf' in schema) {
        for (const s of schema.anyOf) {
            if (validate(value, s, path).ok) return ok()
        }
        return fail(path, `anyOf: no schema matched`)
    }
    switch (schema.type) {
        case 'string': {
            if (typeof value !== 'string') return fail(path, `expected string`)
            if (schema.enum !== undefined && !schema.enum.includes(value)) {
                return fail(path, `expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`)
            }
            return ok()
        }
        case 'number': {
            if (typeof value !== 'number' || Number.isNaN(value)) return fail(path, `expected number`)
            if (schema.minimum !== undefined && value < schema.minimum) return fail(path, `< minimum ${schema.minimum}`)
            if (schema.maximum !== undefined && value > schema.maximum) return fail(path, `> maximum ${schema.maximum}`)
            return ok()
        }
        case 'integer': {
            if (typeof value !== 'number' || !Number.isInteger(value)) return fail(path, `expected integer`)
            if (schema.minimum !== undefined && value < schema.minimum) return fail(path, `< minimum ${schema.minimum}`)
            if (schema.maximum !== undefined && value > schema.maximum) return fail(path, `> maximum ${schema.maximum}`)
            return ok()
        }
        case 'boolean':
            return typeof value === 'boolean' ? ok() : fail(path, `expected boolean`)
        case 'null':
            return value === null ? ok() : fail(path, `expected null`)
        case 'array': {
            if (!Array.isArray(value)) return fail(path, `expected array`)
            for (let i = 0; i < value.length; i++) {
                const r = validate(value[i], schema.items, `${path}[${i}]`)
                if (!r.ok) return r
            }
            return ok()
        }
        case 'object': {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                return fail(path, `expected object`)
            }
            const required = schema.required ?? []
            for (const key of required) {
                if (!(key in value)) return fail(path, `missing required property ${JSON.stringify(key)}`)
            }
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in value) {
                    const r = validate(
                        (value as Record<string, unknown>)[key],
                        propSchema,
                        path === '' ? key : `${path}.${key}`,
                    )
                    if (!r.ok) return r
                }
            }
            // additionalProperties: default true (lenient — LLMs sometimes
            // emit extra hint fields). Set explicitly false to reject.
            if (schema.additionalProperties === false) {
                for (const key of Object.keys(value)) {
                    if (!(key in schema.properties)) {
                        return fail(path, `unexpected property ${JSON.stringify(key)}`)
                    }
                }
            }
            return ok()
        }
        default:
            // Exhaustive — TS guarantees this is unreachable, but log to
            // be safe if a new schema variant lands without updating
            // this switch.
            return fail(path, `unsupported schema (executor needs update)`)
    }
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

const NAME_PATTERN = /^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_]+)$/

function parseToolName(name: string): { controllerId: string; method: string } | null {
    const m = NAME_PATTERN.exec(name)
    if (m === null) return null
    return { controllerId: m[1]!, method: m[2]! }
}

/**
 * Look up a tool, validate args, dispatch to the controller, return an
 * envelope. **Never throws on bad input** — failures come back as
 * `{ ok: false, code, message }`. The only way this function throws is
 * if the controller method itself does *and* `cause` propagation fails
 * (which it shouldn't — `cause` is captured into the result).
 */
export function executeTool(
    name: string,
    args: unknown,
    registry: ControllerRegistry,
    opts: ExecuteToolOptions = {},
): ToolResult {
    const tools = opts.tools ?? ALL_TOOLS
    const tool = opts.tools !== undefined ? tools.find((t) => t.name === name) ?? null : findTool(name)
    if (tool === null) {
        return {
            ok: false,
            code: 'TOOL_NOT_FOUND',
            message: `executeTool: no tool named ${JSON.stringify(name)} in the registry`,
        }
    }

    if (tool.safety === 'destroys-state' && opts.allowDestruction !== true) {
        return {
            ok: false,
            code: 'DESTRUCTIVE_NOT_CONFIRMED',
            message: `executeTool: ${JSON.stringify(name)} is destructive — call again with { allowDestruction: true } after host confirmation`,
        }
    }

    const v = validate(args, tool.inputSchema, '')
    if (!v.ok) {
        return {
            ok: false,
            code: 'INVALID_ARGS',
            message: `executeTool: ${name} args at ${JSON.stringify(v.path)} failed: ${v.msg}`,
        }
    }

    const parsed = parseToolName(name)
    if (parsed === null) {
        // Should be unreachable — schema names are constrained.
        return {
            ok: false,
            code: 'TOOL_NOT_FOUND',
            message: `executeTool: tool name ${JSON.stringify(name)} does not match <id>.<method> pattern`,
        }
    }
    const controller = registry[parsed.controllerId]
    if (controller === undefined || controller === null) {
        return {
            ok: false,
            code: 'CONTROLLER_NOT_REGISTERED',
            message: `executeTool: registry has no entry for ${JSON.stringify(parsed.controllerId)} (needed by ${JSON.stringify(name)})`,
        }
    }
    const method = (controller as Record<string, unknown>)[parsed.method]
    if (typeof method !== 'function') {
        return {
            ok: false,
            code: 'METHOD_NOT_FOUND',
            message: `executeTool: controller ${JSON.stringify(parsed.controllerId)} has no method ${JSON.stringify(parsed.method)}`,
        }
    }

    try {
        const result = (method as (a: unknown) => unknown).call(controller, args)
        return { ok: true, result }
    } catch (e) {
        return {
            ok: false,
            code: 'TOOL_THREW',
            message: `executeTool: ${name} controller method threw — see cause`,
            cause: e,
        }
    }
}

/**
 * Strict variant — throws instead of returning `{ ok: false }`. Use when
 * you want exceptions to propagate (e.g. in tests, or to a host-level
 * error boundary).
 */
export function executeToolOrThrow(
    name: string,
    args: unknown,
    registry: ControllerRegistry,
    opts: ExecuteToolOptions = {},
): unknown {
    const r = executeTool(name, args, registry, opts)
    if (r.ok) return r.result
    throw new Error(`${r.code}: ${r.message}`)
}
