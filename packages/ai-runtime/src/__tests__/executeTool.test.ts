/**
 * Tests for `executeTool` — the LLM-driven tool dispatcher.
 *
 * Coverage:
 *   1. Schema lookup — found / not found.
 *   2. JSON Schema validation on the bundled `ALL_TOOLS` — happy paths
 *      for each tool family (chart / indicators / alerts / replay).
 *   3. Validation failures — wrong type, missing required, enum
 *      violation, < minimum, additionalProperties:false rejection.
 *   4. Registry lookup — missing controller, missing method.
 *   5. Method invocation — args passed through; return value surfaced.
 *   6. Safety policy — destructive tool refused unless
 *      `allowDestruction: true`.
 *   7. Exception in controller method → `TOOL_THREW` with `cause`.
 *   8. `executeToolOrThrow` — happy path returns value;
 *      `ok: false` paths throw.
 *   9. Custom `opts.tools` filters by domain.
 *  10. oneOf / anyOf branching in the validator.
 */

import { describe, it, expect } from 'vitest'

import {
    executeTool,
    executeToolOrThrow,
    type ControllerRegistry,
    type ToolResult,
} from '../executeTool'
import type { JsonSchema, McpToolSchema } from '../types'

// Build a controllers object with spy methods for every (id, method)
// referenced by the bundled tool registry. Returns the registry plus
// a per-call recorder for assertion.
function makeRegistry(): {
    registry: ControllerRegistry
    calls: Array<{ id: string; method: string; args: unknown }>
} {
    const calls: Array<{ id: string; method: string; args: unknown }> = []
    function spy(id: string, method: string) {
        return (args: unknown) => {
            calls.push({ id, method, args })
            return { echoed: args, by: `${id}.${method}` }
        }
    }
    const registry: ControllerRegistry = {
        chart: {
            zoomToLevel: spy('chart', 'zoomToLevel'),
            setTheme: spy('chart', 'setTheme'),
        },
        indicators: {
            add: spy('indicators', 'add'),
            remove: spy('indicators', 'remove'),
            updateParams: spy('indicators', 'updateParams'),
        },
        alerts: {
            addPriceCross: spy('alerts', 'addPriceCross'),
            addIndicatorCross: spy('alerts', 'addIndicatorCross'),
            remove: spy('alerts', 'remove'),
        },
        replay: {
            seekTo: spy('replay', 'seekTo'),
            play: spy('replay', 'play'),
            pause: spy('replay', 'pause'),
            setSpeed: spy('replay', 'setSpeed'),
        },
    }
    return { registry, calls }
}

// ---------------------------------------------------------------------------
// Schema lookup
// ---------------------------------------------------------------------------

describe('executeTool — schema lookup', () => {
    it('returns TOOL_NOT_FOUND for an unknown tool name', () => {
        const { registry } = makeRegistry()
        const r = executeTool('totally.unknown', {}, registry)
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('TOOL_NOT_FOUND')
    })

    it('finds bundled tools by canonical name', () => {
        const { registry } = makeRegistry()
        const r = executeTool('chart.setTheme', { theme: 'dark' }, registry)
        expect(r.ok).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Happy paths across the four tool families
// ---------------------------------------------------------------------------

describe('executeTool — happy paths per family', () => {
    it('chart.setTheme dispatches with args', () => {
        const { registry, calls } = makeRegistry()
        const r = executeTool('chart.setTheme', { theme: 'light' }, registry)
        expect(r.ok).toBe(true)
        expect(calls[0]?.id).toBe('chart')
        expect(calls[0]?.method).toBe('setTheme')
        expect(calls[0]?.args).toEqual({ theme: 'light' })
    })

    it('chart.zoomToLevel dispatches with args', () => {
        const { registry, calls } = makeRegistry()
        const r = executeTool('chart.zoomToLevel', { level: 3 }, registry)
        expect(r.ok).toBe(true)
        expect(calls[0]?.method).toBe('zoomToLevel')
    })

    it('indicators.remove dispatches with instanceId', () => {
        const { registry, calls } = makeRegistry()
        const r = executeTool('indicators.remove', { instanceId: 'ma-1' }, registry)
        expect(r.ok).toBe(true)
        expect(calls[0]?.method).toBe('remove')
    })

    it('alerts.remove dispatches with id', () => {
        // alerts.remove uses { id } per its schema; verify.
        const { registry, calls } = makeRegistry()
        const r = executeTool('alerts.remove', { id: 'a1' }, registry)
        // If this test fails, check the schema in toolSchemas.ts — the
        // arg shape lives there.
        expect(r.ok).toBe(true)
        expect(calls[0]?.method).toBe('remove')
    })

    it('replay.setSpeed dispatches with speed', () => {
        const { registry, calls } = makeRegistry()
        const r = executeTool('replay.setSpeed', { speed: 2 }, registry)
        expect(r.ok).toBe(true)
        expect(calls[0]?.method).toBe('setSpeed')
    })

    it('result envelope carries the controller return value', () => {
        const { registry } = makeRegistry()
        const r = executeTool('chart.setTheme', { theme: 'dark' }, registry)
        expect(r.ok).toBe(true)
        const ok = r as Extract<ToolResult, { ok: true }>
        expect(ok.result).toEqual({ echoed: { theme: 'dark' }, by: 'chart.setTheme' })
    })
})

// ---------------------------------------------------------------------------
// Validation failures
// ---------------------------------------------------------------------------

describe('executeTool — validation failures', () => {
    it('rejects wrong-type primitive', () => {
        const { registry } = makeRegistry()
        const r = executeTool('chart.setTheme', { theme: 123 }, registry)
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('INVALID_ARGS')
    })

    it('rejects missing required property', () => {
        const { registry } = makeRegistry()
        const r = executeTool('chart.setTheme', {}, registry)
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('INVALID_ARGS')
        expect((r as Extract<ToolResult, { ok: false }>).message).toMatch(/required/i)
    })

    it('rejects enum-violation string', () => {
        const { registry } = makeRegistry()
        const r = executeTool('chart.setTheme', { theme: 'orange' }, registry)
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('INVALID_ARGS')
        expect((r as Extract<ToolResult, { ok: false }>).message).toContain('one of')
    })

    it('rejects number below minimum', () => {
        const { registry } = makeRegistry()
        const r = executeTool('replay.setSpeed', { speed: -1 }, registry)
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('INVALID_ARGS')
    })

    it('honours additionalProperties:false when set', () => {
        const { registry } = makeRegistry()
        const strictTool: McpToolSchema = {
            name: 'strict.method',
            description: 'For tests',
            safety: 'readonly',
            inputSchema: {
                type: 'object',
                properties: { a: { type: 'string' } },
                required: ['a'],
                additionalProperties: false,
            },
        }
        const r = executeTool(
            'strict.method',
            { a: 'ok', extra: true },
            { strict: { method: () => true } },
            { tools: [strictTool] },
        )
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).message).toContain('unexpected')
    })

    it('accepts extra properties by default (lenient)', () => {
        const { registry } = makeRegistry()
        // chart.setTheme does NOT have additionalProperties:false, so
        // the extra field should not cause rejection.
        const r = executeTool('chart.setTheme', { theme: 'light', _llmHint: 'x' }, registry)
        expect(r.ok).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Registry lookup failures
// ---------------------------------------------------------------------------

describe('executeTool — registry lookup', () => {
    it('CONTROLLER_NOT_REGISTERED when registry lacks the controller', () => {
        const r = executeTool('chart.setTheme', { theme: 'dark' }, {})
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('CONTROLLER_NOT_REGISTERED')
    })

    it('METHOD_NOT_FOUND when controller lacks the method', () => {
        const r = executeTool(
            'chart.setTheme',
            { theme: 'dark' },
            { chart: { zoomToLevel: () => 1 } }, // setTheme missing
        )
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('METHOD_NOT_FOUND')
    })

    it('CONTROLLER_NOT_REGISTERED when controller is explicitly null', () => {
        const r = executeTool('chart.setTheme', { theme: 'dark' }, { chart: null })
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('CONTROLLER_NOT_REGISTERED')
    })
})

// ---------------------------------------------------------------------------
// Exception in controller method
// ---------------------------------------------------------------------------

describe('executeTool — controller method throws', () => {
    it('returns TOOL_THREW with the cause captured', () => {
        const err = new Error('boom')
        const registry: ControllerRegistry = {
            chart: {
                setTheme: () => {
                    throw err
                },
                zoomToLevel: () => null,
            },
        }
        const r = executeTool('chart.setTheme', { theme: 'dark' }, registry)
        expect(r.ok).toBe(false)
        const fail = r as Extract<ToolResult, { ok: false }>
        expect(fail.code).toBe('TOOL_THREW')
        expect(fail.cause).toBe(err)
    })
})

// ---------------------------------------------------------------------------
// Safety policy
// ---------------------------------------------------------------------------

describe('executeTool — safety policy', () => {
    it('refuses destructive tool without allowDestruction', () => {
        const destructiveTool: McpToolSchema = {
            name: 'chart.dispose',
            description: 'Dispose the chart instance',
            safety: 'destroys-state',
            inputSchema: { type: 'object', properties: {} },
        }
        const r = executeTool(
            'chart.dispose',
            {},
            { chart: { dispose: () => null } },
            { tools: [destructiveTool] },
        )
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('DESTRUCTIVE_NOT_CONFIRMED')
    })

    it('runs destructive tool when allowDestruction: true', () => {
        const destructiveTool: McpToolSchema = {
            name: 'chart.dispose',
            description: 'x',
            safety: 'destroys-state',
            inputSchema: { type: 'object', properties: {} },
        }
        let called = false
        const r = executeTool(
            'chart.dispose',
            {},
            {
                chart: {
                    dispose: () => {
                        called = true
                        return null
                    },
                },
            },
            { tools: [destructiveTool], allowDestruction: true },
        )
        expect(r.ok).toBe(true)
        expect(called).toBe(true)
    })

    it('readonly + mutates-state tools always run', () => {
        const { registry } = makeRegistry()
        const r1 = executeTool('chart.setTheme', { theme: 'dark' }, registry)
        expect(r1.ok).toBe(true)
        // chart.setTheme is 'mutates-state'; allowDestruction not set.
    })
})

// ---------------------------------------------------------------------------
// JSON Schema oneOf / anyOf branching
// ---------------------------------------------------------------------------

describe('executeTool — oneOf / anyOf', () => {
    const oneOfTool: McpToolSchema = {
        name: 'oneof.method',
        description: 'x',
        safety: 'readonly',
        inputSchema: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
        } as JsonSchema,
    }

    it('oneOf passes when exactly one branch matches', () => {
        const r = executeTool(
            'oneof.method',
            'hello',
            { oneof: { method: () => null } },
            { tools: [oneOfTool] },
        )
        expect(r.ok).toBe(true)
    })

    it('oneOf fails when no branch matches', () => {
        const r = executeTool(
            'oneof.method',
            true,
            { oneof: { method: () => null } },
            { tools: [oneOfTool] },
        )
        expect(r.ok).toBe(false)
        expect((r as Extract<ToolResult, { ok: false }>).code).toBe('INVALID_ARGS')
    })

    const anyOfTool: McpToolSchema = {
        name: 'anyof.method',
        description: 'x',
        safety: 'readonly',
        inputSchema: {
            anyOf: [{ type: 'string' }, { type: 'number' }],
        } as JsonSchema,
    }

    it('anyOf passes when at least one branch matches', () => {
        const r = executeTool(
            'anyof.method',
            42,
            { anyof: { method: () => null } },
            { tools: [anyOfTool] },
        )
        expect(r.ok).toBe(true)
    })

    it('anyOf fails when no branch matches', () => {
        const r = executeTool(
            'anyof.method',
            { not: 'allowed' },
            { anyof: { method: () => null } },
            { tools: [anyOfTool] },
        )
        expect(r.ok).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// executeToolOrThrow
// ---------------------------------------------------------------------------

describe('executeToolOrThrow', () => {
    it('returns the value on success', () => {
        const { registry } = makeRegistry()
        const out = executeToolOrThrow('chart.setTheme', { theme: 'dark' }, registry)
        expect(out).toEqual({ echoed: { theme: 'dark' }, by: 'chart.setTheme' })
    })

    it('throws on TOOL_NOT_FOUND', () => {
        const { registry } = makeRegistry()
        expect(() => executeToolOrThrow('nope', {}, registry)).toThrow(/TOOL_NOT_FOUND/)
    })

    it('throws on validation failure with code in message', () => {
        const { registry } = makeRegistry()
        expect(() =>
            executeToolOrThrow('chart.setTheme', { theme: 'orange' }, registry),
        ).toThrow(/INVALID_ARGS/)
    })
})
