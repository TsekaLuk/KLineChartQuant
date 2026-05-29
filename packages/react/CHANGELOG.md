# @klinechart-quant/react

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Pre-1.0 alpha and beta releases may break in any release.

## [Unreleased]

### Added

- **Imperative mount API**: `createChart(opts)` returns a
  `ChartController`. SSR-safe — module-scope import does not touch
  `window` or `document`. The `useEffect`-based mount is the only
  code path that interacts with the DOM.
- **Eight hooks**: `useChart`, `useIndicatorSelector`, `useToolbar`,
  `useDrawing`, `useVolumeProfile`, `useOrderBookHeatmap`,
  `useFootprint`, `useAnchoredVwap`, `useMtfOverlay`. Each binds to
  the corresponding `@klinechart-quant/core` controller via React's
  `useSyncExternalStore`.
- Canonical intake verbs (`ingest` / `setData` / `append`) exposed
  on the relevant hooks alongside the original method names.
- KLineChartError migration: error thrown when `createChart` is
  invoked with `opts === null` or a missing container now carries
  the `CONTROLLER_CONFIG_INVALID` code.

### Tests

- 7 contract tests verifying SSR-safe import, factory injection,
  and hook lifecycle.

### Peer dependencies

- `react >=18.0.0 <20.0.0`
- `@klinechart-quant/core ^0.1.0-alpha`

## [0.1.0-alpha.0] — 2026-05-28

Initial alpha. 7-hook surface introduced in commit `c44f9a6`
(DX BLOCKER batch) plus the canonical-verb pass in commits
`f854c68` / `d2153df`.
