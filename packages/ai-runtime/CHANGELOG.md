# @klinechart-quant/ai-runtime

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Pre-1.0 alpha and beta releases may break in any release.

## [Unreleased]

### Added

- **12 MCP tool schemas** covering chart introspection (`describe`,
  `getIndicatorValue`, `getActiveIndicators`, `getViewport`,
  `getTheme`), state mutation (`setViewport`, `setTheme`,
  `addIndicator`, `removeIndicator`, `setIndicatorParam`,
  `createAlert`, `deleteAlert`), and snapshot transport
  (`serialize`, `deserialize`). Schemas follow the JSON Schema
  draft 7 dialect MCP servers consume.
- **`describe(snapshot)`** for `ChartController`,
  `IndicatorSelectorController`, `AlertsController`,
  `DrawingController` — produces a stable
  `{ summary: string, facts: Record<string, ...> }` shape suitable
  for LLM context windows.
- **`serialize(snapshot)` / `deserialize(json)`** — round-trip a
  `SerializedChartState` JSON document. No code generation, no
  `eval`; the LLM only composes from existing capabilities.
  `schemaVersion` field locks the wire format; mismatches throw
  `KLineChartError('SCHEMA_VERSION_MISMATCH')`.

### Changed

- `ChartSerializationError` now extends
  `KLineChartError` from `@klinechart-quant/core`. Cross-package
  `instanceof KLineChartError` works for all serialization
  failures. The old class name remains exported as a deprecated
  alias.

### Tests

- 38 tests covering MCP tool registration, `describe` output
  shape per controller, and `serialize`/`deserialize` round-trip
  + every error path (`INVALID_JSON`, `NOT_OBJECT`,
  `SCHEMA_VERSION_MISMATCH`, `INVALID_TIMESTAMP`,
  `MISSING_CONTROLLERS`).

### Peer dependencies

- `@klinechart-quant/core ^0.1.0-alpha`

## [0.1.0-alpha.0] — 2026-05-28

Initial alpha. Created in commit `ec609aa`.
