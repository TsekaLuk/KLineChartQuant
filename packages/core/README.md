# @klinechart-quant/core

> Headless K-line chart engine + reactive controllers. Zero framework dependencies. The substrate every adapter (`@klinechart-quant/react`, `/vue`, `/angular`) builds on.

```bash
pnpm add @klinechart-quant/core
```

## What's in the box

| Module | Purpose | Public exports (selected) |
| --- | --- | --- |
| `reactivity` | Push-based signal layer (zero deps, ~150 LOC) | `createSignal`, `effect`, `computed`, `batch`, `Signal<T>` |
| `controllers` | Framework-agnostic state machines for chart features | `createChartController`, `createIndicatorSelectorController`, `createToolbarController`, `createDrawingController` |
| `render` | GPU backend abstraction (WebGL today, WebGPU next) | `SurfaceBackend`, `Renderer`, `RendererCapabilities` |
| `scale` | Coordinate system math: bar-index X, linear/log Y, anchored zoom, fp32 origin-shift | `createTimeScale`, `createPriceScale`, `computeAnchoredZoom`, `createOriginShiftPolicy` |
| `scene` | Layer composition + paint order | `createScene`, `createLayerRegistry`, `Layer`, `BUILTIN_LAYER_TYPES` |
| `replay` | Bar-replay state machine (bar / wall-clock / tick pacing) | `createReplayController` |
| `alerts` | Predicate-based rule engine (10 kinds, serializable, sandboxed custom) | `createAlertController`, `evaluatePredicate`, `serializeRule`, `deserializeRule` |
| `chartTypes` | Heikin Ashi, Renko (fixed + ATR), Point & Figure, Range Bars | `createHeikinAshi`, `createRenko`, `createPointAndFigure`, `createRangeBars` |
| `components/volumeProfile` | POC + Value Area + binning (typical-price / proportional) | `createVolumeProfileController`, `computeValueArea`, `findPOCIndex` |
| `components/orderBookHeatmap` | Streaming L2 + snapshot ring + delta archive + log color scale | `createHeatmapController`, `createOrderBookState`, `createLogColorScale` |
| `components/footprint` | Aggressor classification + delta + diagonal imbalance + CVD | `createFootprintController`, `classifyTickRule`, `classifyLeeReady`, `computeDelta` |
| `components/anchoredVwap` | Multi-anchor VWAP + 1σ/2σ bands (prevailing-AVWAP variance) | `createAnchoredVwapController`, `computeAnchoredVwap` |
| `components/mtfOverlay` | Resample + no-lookahead align + indicator-agnostic MTF | `createMtfController`, `resampleBars`, `alignToBaseIndex` |

## Quick start (framework-agnostic)

```typescript
import {
    createChartController,
    createVolumeProfileController,
    createAlertController,
} from '@klinechart-quant/core'

const container = document.getElementById('chart')!
const chart = createChartController({
    container,
    data: [/* KLineData[] */],
    initialZoomLevel: 5,
    theme: 'dark',
})

// Subscribe to viewport changes (works in any framework, no adapter needed)
const unsub = chart.viewport.subscribe(() => {
    console.log('zoom:', chart.viewport().zoomLevel)
})

// Compose component controllers
const vp = createVolumeProfileController({
    config: { binCount: 100, binningMode: 'typical-price', valueAreaPercent: 0.7 },
})
vp.ingest(/* bars */)
const state = vp.state()
console.log('POC:', state?.poc, 'VAH:', state?.vah, 'VAL:', state?.val)

// Add a price-cross alert
const alerts = createAlertController()
alerts.addRule({
    id: 'btc-100k',
    name: 'BTC crosses 100k',
    predicate: { kind: 'price-cross', price: 100_000, direction: 'up' },
    enabled: true,
    oneShot: true,
})

// Cleanup
unsub()
vp.dispose()
alerts.dispose()
chart.dispose()
```

## Reactive contract

Every controller exposes its state as one or more `Signal<T>`. Signals are:

- **Push-based** — subscribers are notified synchronously on `set` if the new value differs by `Object.is`.
- **Stable identity** — a controller that mutates an array returns a NEW array (immutable updates), so subscribers' `===` checks see a fresh reference.
- **Framework-bridgeable** — `useSyncExternalStore` in React, `shallowRef + effect` in Vue, `toSignal` (or our own `coreSignalToAngular`) in Angular all bridge cleanly.

```typescript
const signal = createSignal(0)
signal.set(1)              // notifies subscribers
signal.peek()              // read without tracking
const unsub = signal.subscribe(() => console.log(signal()))
unsub()                    // detach
```

## Dispose contract

Every controller has `dispose()`. After dispose:

- Subsequent mutators are silent no-ops (return `false`/`null` where typed; throw nowhere)
- Previously-attached subscribers receive no further notifications
- Idempotent: `dispose()` can be called any number of times safely

## Architecture pointers

The layered architecture (interaction → store → scene → scale/data/compute/render) is documented in [`docs/ROADMAP.md`](../../docs/ROADMAP.md). The competitive positioning vs TradingView Pro/Premium is in [`docs/COMPETITIVE_ANALYSIS.md`](../../docs/COMPETITIVE_ANALYSIS.md).

## Sub-path imports (tree-shake friendly)

```typescript
// If you only need the reactive layer:
import { createSignal, effect } from '@klinechart-quant/core/reactivity'

// If you only need the controller interfaces:
import type { ChartController, IndicatorSelectorController } from '@klinechart-quant/core/controllers'
```

## Browser support

| Feature | Required | Notes |
| --- | --- | --- |
| ES2022 | Yes | Top-level `await`, error cause, `Array.prototype.at` |
| `Object.is` | Yes | Universally available |
| `Float64Array` / `Float32Array` | Yes | For binning + GPU upload |
| WebGL2 | Today (default renderer) | Render fallback for browsers without WebGPU |
| WebGPU | Next (P1) | Compute path for Volume Profile binning, M4 downsampling, Order Book heatmap |

## License

MIT
