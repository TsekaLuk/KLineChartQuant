/**
 * @klinechart-quant/ai-runtime
 *
 * AI Native runtime — ROADMAP §10.3 — sits on top of the framework-agnostic
 * controllers in `@klinechart-quant/core` and exposes three things every
 * LLM-driven UX needs:
 *
 *   1. MCP tool schemas — `ALL_TOOLS`, `TOOL_GROUPS`, `findTool`
 *   2. `describe(...)` functions — controller-state → LLM-readable text
 *   3. State serialization — round-trip "AI templates" across sessions
 *
 * This package is INTENTIONALLY provider-agnostic. Anthropic / OpenAI /
 * Gemini / local-model adapters live in follow-up packages.
 */

export type * from './types'

export {
    ALL_TOOLS,
    TOOL_GROUPS,
    CHART_NAVIGATION_TOOLS,
    INDICATOR_TOOLS,
    ALERT_TOOLS,
    REPLAY_TOOLS,
    findTool,
} from './toolSchemas'

export {
    describeVolumeProfileState,
    describeAnchoredVwapState,
    describeFootprintState,
    describeAlertsState,
    type VolumeProfileSnapshot,
    type AnchoredVwapSeriesSnapshot,
    type FootprintLatestBarSnapshot,
    type AlertSnapshot,
} from './describeControllers'

export {
    serialize,
    deserialize,
    ChartSerializationError,
    type ChartSnapshotInput,
} from './serialization'
