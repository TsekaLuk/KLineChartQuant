# @klinechart-quant/vue

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Pre-1.0 alpha and beta releases may break in any release.

## [Unreleased]

### Added

- **Imperative mount API**: `createChart(opts)` returns a
  `ChartController`. SSR-safe — module-scope import does not touch
  `window` or `document`; the mount path is gated by the host's
  `onMounted` / template ref lifecycle.
- **Eight composables** mirroring the React hook surface:
  `useChart`, `useIndicatorSelector`, `useToolbar`, `useDrawing`,
  `useVolumeProfile`, `useOrderBookHeatmap`, `useFootprint`,
  `useAnchoredVwap`, `useMtfOverlay`. Each binds to the
  corresponding `@klinechart-quant/core` controller using Vue's
  reactivity bridge (`shallowRef` + `watchEffect` adapter).
- Canonical intake verbs (`ingest` / `setData` / `append`) exposed
  on the relevant composables alongside the original method names.

### Tests

- 6 contract tests verifying SSR-safe import, factory injection,
  and composable lifecycle.

### Peer dependencies

- `vue >=3.4.0 <4.0.0`
- `@klinechart-quant/core ^0.1.0-alpha`

## [0.1.0-alpha.0] — 2026-05-28

Initial alpha. 7-composable surface introduced in commit `291c4c4`
plus the canonical-verb pass in `d2153df`.
