/**
 * @klinechart-quant/ai-runtime — public types.
 *
 * Wraps the framework-agnostic controllers from `@klinechart-quant/core` into
 * shapes that AI runtimes (Claude function calling, OpenAI function calling,
 * MCP servers, custom agents) can directly consume.
 *
 * Three things ship from this package:
 *
 * 1. **Tool schemas** (`McpToolSchema`) — JSON-Schema-compatible descriptors
 *    of every mutator method on every controller. Generated once from the
 *    type catalog; consumable by any function-calling LLM API.
 *
 * 2. **`describe(controller)`** — turns the current state of a controller
 *    into structured natural-language descriptors the LLM can read. This is
 *    the "read-back" layer §10.3 calls for: the LLM doesn't poke at signals,
 *    it reads a snapshot tailored for it.
 *
 * 3. **State serialization** — `serialize(chart)` / `deserialize(json)` so
 *    saved "AI analysis templates" round-trip across sessions.
 *
 * The runtime is intentionally STATELESS w.r.t. the LLM. It does not bind to
 * any specific provider. Adapters for Claude / OpenAI / Gemini live in
 * follow-up packages (`@klinechart-quant/ai-runtime-claude` etc.) and are
 * not in scope for this package.
 */

/**
 * One tool the AI can call. Mirrors the MCP `Tool` shape so the same
 * descriptors plug into an MCP server with zero conversion.
 *
 * `inputSchema` is JSON Schema draft 2020-12 — the only flavour every LLM
 * provider agrees on. We do not invent a richer schema language here.
 */
export interface McpToolSchema {
    /** Stable name. Convention: `<controller-id>.<method>`, e.g. `alerts.addRule`. */
    name: string

    /** Plain-English description the LLM reads to decide when to call. */
    description: string

    /** Input arguments as JSON Schema. */
    inputSchema: JsonSchema

    /** Optional return type hint (not standardised across providers; informative). */
    outputSchema?: JsonSchema

    /**
     * Side-effect classification. The runtime uses this to gate dangerous
     * tools (e.g. `chart.dispose`) behind an explicit confirmation step.
     */
    safety: 'readonly' | 'mutates-state' | 'destroys-state'
}

/**
 * Minimal JSON Schema subset we actually emit. Intentionally narrow — every
 * LLM provider accepts these forms.
 */
export type JsonSchema =
    | { type: 'object'; properties: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean; description?: string }
    | { type: 'array'; items: JsonSchema; description?: string }
    | { type: 'string'; enum?: ReadonlyArray<string>; description?: string }
    | { type: 'number'; minimum?: number; maximum?: number; description?: string }
    | { type: 'integer'; minimum?: number; maximum?: number; description?: string }
    | { type: 'boolean'; description?: string }
    | { type: 'null'; description?: string }
    | { oneOf: JsonSchema[]; description?: string }
    | { anyOf: JsonSchema[]; description?: string }

/**
 * A descriptive snapshot of a controller's current state, formatted for an
 * LLM to read. `summary` is the one-paragraph natural language; `facts` is
 * the structured fields the LLM may want to quote precisely.
 *
 * Implementations of `describe()` produce this shape; the LLM gets both
 * (it picks which to use depending on the task).
 */
export interface ControllerDescription {
    /** Controller identifier (`'alerts'`, `'volumeProfile'`, …). */
    controllerId: string

    /** One-paragraph natural-language summary, 30–80 words. */
    summary: string

    /** Structured facts, keyed for reliable LLM quotation. */
    facts: Readonly<Record<string, string | number | boolean | null>>

    /** Optional human-readable warnings ("dispose was called", "stale data"). */
    warnings?: ReadonlyArray<string>
}

/**
 * Top-level serialized chart state — what `serialize(chart)` returns and
 * `deserialize(json)` consumes. Versioned so future schema changes are safe.
 */
export interface SerializedChartState {
    /** Schema version; bumped on breaking changes. Current: 1. */
    schemaVersion: 1

    /** ISO timestamp of when this snapshot was taken. */
    snapshotTakenAt: string

    /** Optional user-supplied label, e.g. "BTC swing-trade setup 2026-Q1". */
    label?: string

    /** Per-controller payloads. Each is the controller's own serialized form. */
    controllers: {
        viewport?: { zoomLevel: number; visibleFrom: number; visibleTo: number }
        theme?: 'light' | 'dark'
        indicators?: ReadonlyArray<{ definitionId: string; params: Readonly<Record<string, number | string | boolean>> }>
        alerts?: ReadonlyArray<{ id: string; name: string; predicate: unknown; oneShot: boolean; cooldownMs?: number }>
        // anchoredVwap, footprint config, etc. — added as the corresponding
        // controllers ship their `serialize()` method
    }
}
