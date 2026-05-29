---
"@klinechart-quant/core": minor
"@klinechart-quant/ai-runtime": minor
"@klinechart-quant/react": minor
"@klinechart-quant/vue": minor
"@klinechart-quant/angular": minor
---

Foundation drop (PR #23 + PR #24). Multi-framework monorepo with five
publishable packages and an autonomous-loop foundation across nine
quality axes.

Highlights (per-package detail in each `CHANGELOG.md`):

- **errors taxonomy**: `KLineChartError` + 17 codes + recovery hints
  + dev-overlay formatter. Zero plain-`Error` throws remain in the
  publishable surface (77 throws migrated).
- **design tokens**: 4 token families × 2 themes (WCAG-AA verified
  for shipped contrast floors) + `themeToCssVars` bridge +
  baseline-snapshot lock.
- **input layer**: keyboard shortcut registry + pan/pinch/tap/swipe
  gesture recognizer + multi-pane crosshair sync.
- **renderer tier**: sync WebGPU → WebGL2 → Canvas2D detection +
  structural-fallback backend selector with tier-floor support.
- **scheduler**: frame-budget priority queue with deadline-bounded
  flush + rolling-average fps telemetry.
- **indicators**: MA family (ALMA / T3 / ZLEMA / LSMA / VIDYA / FRAMA)
  + oscillator pack (StochRSI / AO / UO / DPO / Fisher / STC).
- **AI Native**: `@klinechart-quant/ai-runtime` with 12 MCP tools,
  per-controller `describe()`, and `serialize` / `deserialize`
  round-trip — no eval, no code generation.

Tests: 909 + 1 todo across 5 publishable packages.
