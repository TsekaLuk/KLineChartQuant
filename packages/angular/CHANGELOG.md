# @klinechart-quant/angular

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Pre-1.0 alpha and beta releases may break in any release.

## [Unreleased]

### Added

- **Imperative mount API**: `createChart(opts)` returns a
  `ChartController`. SSR-safe via Angular Universal — the
  `opts.factory` defaults to `createChartController` from
  `@klinechart-quant/core` and is only invoked client-side. Server
  prerender renders the host element; the chart materialises after
  hydration.
- **Bindings module** with `injectChart` plus seven `injectXxx`
  injectables mirroring the React hook and Vue composable surfaces:
  `IndicatorSelector`, `Toolbar`, `Drawing`, `VolumeProfile`,
  `OrderBookHeatmap`, `Footprint`, `AnchoredVwap`, `MtfOverlay`.
- Canonical intake verbs (`ingest` / `setData` / `append`) exposed
  on the relevant injectables alongside the original method names.

### Tests

- 12 contract tests + 1 todo verifying SSR-safe import, factory
  injection, signal interop, and lifecycle.

### Peer dependencies

- `@angular/core >=17.0.0 <20.0.0`
- `@klinechart-quant/core ^0.1.0-alpha`

## [0.1.0-alpha.0] — 2026-05-28

Initial alpha. Bindings introduced in commit `c44f9a6`
(DX BLOCKER batch) plus the canonical-verb pass in `d2153df`.
