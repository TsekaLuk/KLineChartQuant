# @klinechart-quant/core

All notable changes to this package are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project will adhere to [Semantic Versioning](https://semver.org/)
once `1.0.0` is cut. Pre-1.0 alpha and beta releases may break in any
release; review the entries below before bumping.

## [Unreleased]

The bulk of the foundation drop. Roughly ordered by subsystem; within a
subsystem, listed in the order they were introduced during the
autonomous-loop run (ticks 0–24).

### Added — error taxonomy

- `KLineChartError` shared base class extending `Error` with a
  string-union `code` and ES2022 `cause` forwarding. 17 codes covering
  scale, footprint, anchored VWAP, indicators, heatmap, MTF, alternative
  chart types, replay, controller wiring, and serialization.
- `isKLineChartError(value)` + overloaded `isKLineChartError(value, code)`
  type-guard for code-narrowing in catch blocks.
- 77 throw sites across the publishable surface migrated from plain
  `Error` to `KLineChartError`. Zero plain-`Error` throws remain.
- `getRecoveryHint(code)` — every code has a 1–2 sentence "what to do
  next" hint. Unique by construction (test enforces no copy-paste).
- `formatKLineChartError(err, opts?)` — dev-overlay-ready multi-line
  plaintext formatter with recursive cause-chain rendering and
  pass-through for non-`KLineChartError` inputs.

### Added — design tokens

- `tokens/` module with four typed families:
  - `ColorTokens` — 31 semantic roles plus a 10-color
    `IndicatorPalette`.
  - `SpacingTokens` — 4-px scale from `none` to `xxxl`.
  - `TypographyTokens` — font stack + sizes + weights + line-heights.
  - `MotionTokens` — durations + easings.
- `lightTheme` and `darkTheme` presets, paired (same key set in both;
  test enforces parity). Light-theme bull/bear values tightened from
  industry defaults to meet WCAG AA contrast on white (`#0F8B5C`,
  `#C2363B`); `alertTriggered` and `mtfOverlay` similarly tightened
  with rationale captured in the theme file.
- `mergeTheme(base, override)` — shallow-per-family override, deep on
  `colors.palette`, never mutates inputs.
- `themeToCssVars(theme, prefix?)` — emits a `Record<cssVarName, string>`
  using the `--klc-{family}-{kebab-key}` naming convention. 64
  variables per theme.
- `toCssDeclarationBlock(vars, selector?)` — renders the var map as
  `:root { ... }` (or any selector) for SSR injection.
- Token baseline snapshots (`tokens/__tests__/__snapshots__/`) lock the
  shipped CSS + per-theme contrast report; 26 hard contrast-floor
  assertions across 13 roles × 2 themes with surface-aware
  measurement.

### Added — input layer

- `createShortcutRegistry({ platform? })` — combo parser
  (modifier-order-independent), canonical form, platform-aware
  `Mod` resolution (mac → `Meta`, other → `Ctrl`), conflict
  detection, `when` predicate gating, `findByKeyboardEvent` for
  one-line DOM bridging.
- `createGestureRecognizer({ panDeadzone?, swipeMinVelocity?, swipeVelocityWindowMs? })`
  — 1-pointer pan + 2-pointer pinch state machine with tap and swipe
  terminal states. Promotion path emits `panStart` and the first
  `pan` together (no second-move latency). Pinch demotes to
  `tracking` when one finger lifts.
- `createCrosshairSync()` — multi-pane crosshair coordinator that
  broadcasts `{ index, source }` over the bar-index axis. Source-aware
  loop-prevention pattern documented in the header.

### Added — renderer tier

- `detectRendererTier({ probes? })` — synchronous WebGPU → WebGL2 →
  Canvas2D → none cascade with probe injection for tests. Probe
  exceptions are folded into the result's `reason` string rather
  than aborting the cascade.
- `detectRendererTierOrThrow` — strict variant.
- `compareRendererTier(a, b)` and `isTierAtLeast(tier, minimum)`
  guards built on `RENDERER_TIER_RANK`.
- `selectBackend({ registry, detection?, detect?, minimum? })` —
  bridges tier detection to the backend factory the renderer will
  instantiate. Supports drop-WebGPU bundle-size optimisation,
  test-time Canvas2D stub injection, and tier floors for
  GPU-compute features.

### Added — scheduler

- `createFrameBudget({ targetMs?, historySize?, maxQueueSize?, now? })`
  — 3-tier priority queue with FIFO within tier, coalesce-by-id
  (later submission wins, re-buckets on tier change), `maxQueueSize`
  drops oldest low → medium (never high), `flush(deadlineAbs)`
  deadline-bounded with throw-isolation, rolling-average
  `recentFrameMs`, cumulative `overruns` counter, injectable clock
  for deterministic tests.

### Added — indicators

- MA family completion pack: ALMA, T3, ZLEMA, LSMA, VIDYA, FRAMA.
- Oscillator completion pack: StochRSI, Awesome Oscillator,
  Ultimate Oscillator, DPO, Fisher Transform, Schaff Trend Cycle.

### Added — API surface

- Canonical intake verbs (`ingest` / `setData` / `append`) wired
  across `VolumeProfile`, `OrderBookHeatmap`, `Footprint`,
  `AnchoredVwap`, `MtfOverlay`. Old method names remain as
  `@deprecated` identity-equal aliases.
- `@internal` JSDoc tags applied to 8 helpers leaked via the root
  `export *` to keep them out of generated docs (typedoc /
  api-extractor).

### Performance

- `__bench__/` suite with 14 benchmarks across 4 files. Real
  numbers locked: Signal set 13–17 ns; VolumeProfile typical-price
  on 100 k bars 4.32–5.59 ms; OrderBook applyDelta 68 ns;
  anchored-zoom 19.5 ns; origin-shift 9.3 ns.

### Tests

- 845 unit + snapshot tests in this package. 49 test files. 0
  skipped. Snapshots under `tokens/__tests__/__snapshots__/`.

### Internal

- `KLineChartError` migration was incremental: b-3 (14 throws),
  b-3b (30 throws), b-3c (33 throws). See the merged-commit
  history for the per-file breakdown.
- Loop ledger and tribunal commits live in the repo root
  (`LOOP_LEDGER.md`) and document the autonomous decisions; they
  do not ship with the published package.

## [0.1.0-alpha.0] — 2026-05-28

Initial alpha. Multi-framework foundation (`#23`) + the foundation
drop above (`#24`). No prior published versions.
