# API Audit — @klinechart-quant

Date: 2026-05-29
Branch: `feat/renderer-interface`
Scope: `packages/{core,react,vue,angular,ai-runtime}` public surface
Reviewer: third-party API design

---

## Verdict

**API consistency: 4/10. FAIL for v1.0 publish.** Five distinct verbs for "feed data in", five distinct return-value conventions on mutators, no error taxonomy (every throw is plain `Error`), and `packages/core/src/index.ts` flat re-exports every internal compute helper — `binBarToBuckets`, `findPOCIndex`, `computeValueArea`, `computeDelta`, `computeDiagonalImbalances`, `computeAnchoredVwap`, `computeAnchoredZoom`, `createOriginShiftPolicy`, `resampleBars`, `alignToBaseIndex`, `classifyTickRule`, `classifyLeeReady` — into the top-level package surface. Ship this and competitors will write the migration guide for us.

---

## Glossary inconsistencies table — "feed data into a controller"

| Module | File:line | Verb | Object | Example |
|---|---|---|---|---|
| `volumeProfile` | `packages/core/src/components/volumeProfile/types.ts:111` | `ingest` | bars[] | `vp.ingest(bars)` |
| `anchoredVwap` | `packages/core/src/components/anchoredVwap/types.ts:127` | `setBars` | bars[] | `avwap.setBars(bars)` |
| `anchoredVwap` (single) | `packages/core/src/components/anchoredVwap/types.ts:166` | `appendBar` | bar | `avwap.appendBar(bar)` |
| `mtfOverlay` | `packages/core/src/components/mtfOverlay/types.ts:103` | `setBaseBars` | bars[], ms | `mtf.setBaseBars(bars, intervalMs)` |
| `mtfOverlay` (single) | `packages/core/src/components/mtfOverlay/types.ts:129` | `appendBaseBar` | bar | `mtf.appendBaseBar(bar)` |
| `footprint` | `packages/core/src/components/footprint/types.ts:202` | `ingestTrade` | trade | `fp.ingestTrade(t, bid?, ask?)` |
| `orderBookHeatmap` | `packages/core/src/components/orderBookHeatmap/types.ts:142` | `ingestDelta` | delta | `hm.ingestDelta(d)` |
| `chartController` | `packages/core/src/controllers/types.ts:186` | `setData` | bars[] | `chart.setData(next)` |
| `chartController` (extend) | `packages/core/src/controllers/types.ts:187` | `appendData` | bars[] | `chart.appendData(next)` |
| `chartTypes` (batch) | `packages/core/src/chartTypes/types.ts:87` | `transform` | input + config | `ha.transform(input, cfg)` |
| `chartTypes` (single) | `packages/core/src/chartTypes/types.ts:96` | `appendBar` | bar | `ha.appendBar(bar)` |
| `replay` | `packages/core/src/replay/types.ts:96` | `tick` | deltaMs | `r.tick(16)` |
| `alerts` | `packages/core/src/alerts/types.ts:165` | `evaluate` | snapshot, now | `a.evaluate(snap, now)` |
| `orderBookHeatmap.OrderBookState` | `packages/core/src/components/orderBookHeatmap/types.ts:67` | `applyDelta` | delta | `book.applyDelta(d)` |
| `orderBookHeatmap.DeltaArchive` | `packages/core/src/components/orderBookHeatmap/types.ts:94` | `append` | delta | `archive.append(d)` |
| `orderBookHeatmap.SnapshotRing` | `packages/core/src/components/orderBookHeatmap/types.ts:82` | `push` | snapshot | `ring.push(s)` |

**Verdict**: 11 verbs across 16 mutators for what is conceptually "consume an input". This is the headline reason new users will not be able to predict any API.

---

# Findings (51 total, severity-sorted)

## BLOCKERS

### BLOCKER-001 — Five different verbs for "feed bars into a controller"

**Files:**
- `packages/core/src/components/volumeProfile/types.ts:111` (`ingest`)
- `packages/core/src/components/anchoredVwap/types.ts:127` (`setBars`)
- `packages/core/src/components/mtfOverlay/types.ts:103` (`setBaseBars`)
- `packages/core/src/controllers/types.ts:186-187` (`setData` / `appendData`)
- `packages/core/src/components/footprint/types.ts:202` (`ingestTrade`)
- `packages/core/src/components/orderBookHeatmap/types.ts:142` (`ingestDelta`)
- `packages/core/src/replay/types.ts:96` (`tick`)
- `packages/core/src/components/orderBookHeatmap/types.ts:67,82,94` (`applyDelta`, `push`, `append`)

**Issue:** A user who knows `vp.ingest(bars)` cannot guess `avwap.setBars(bars)`, cannot guess `mtf.setBaseBars(bars, ms)`, cannot guess `fp.ingestTrade(t)`. Every controller invents its own intake vocabulary. This is the single largest barrier to API discoverability — `Stripe` / `tRPC` win because every verb is predictable.

**Fix:** Canonicalise on two verbs and migrate everything in one pass before v1:
- `setData(input)` — replace the whole dataset (idempotent, recomputes from scratch). Already used by `ChartController`. Adopt for volumeProfile, anchoredVwap, mtfOverlay (i.e. rename `ingest` → `setData`, `setBars` → `setData`, `setBaseBars` → `setData` with a `meta` arg or via a config setter for `baseIntervalMs`).
- `append(input)` — incremental single-or-many items. Adopt for `appendData`, `appendBar`, `appendBaseBar`, `ingestTrade`, `ingestDelta`.

Keep old names alive for one minor cycle: `@deprecated` alias on each old method that forwards to the new name. Drop in 2.0.

### BLOCKER-002 — Top-level `index.ts` re-exports internal compute helpers as public API

**File:** `packages/core/src/index.ts:1-13` (`export *` across 13 modules)

`export *` across every barrel means EVERY internal helper from every module becomes part of `@klinechart-quant/core`'s public surface. The 12 worst leaks, all `export`ed via `packages/core/src/index.ts`:

1. `binBarToBuckets` — `packages/core/src/components/volumeProfile/index.ts:9` — pure low-level math, an implementation detail of `ingest`. Users will never call this.
2. `findPOCIndex` — `packages/core/src/components/volumeProfile/index.ts:10` — internal POC search, exposes `Float64Array` argmax.
3. `computeValueArea` — `packages/core/src/components/volumeProfile/index.ts:11` — internal greedy expansion.
4. `computeAnchoredVwap` — `packages/core/src/components/anchoredVwap/index.ts:9` — math the controller wraps; useless without an anchor management story.
5. `resampleBars` — `packages/core/src/components/mtfOverlay/index.ts:24` — only ever called by `createMtfController`.
6. `alignToBaseIndex` — `packages/core/src/components/mtfOverlay/index.ts:25` — internal alignment helper.
7. `classifyExplicit` / `classifyTickRule` / `classifyLeeReady` — `packages/core/src/components/footprint/index.ts:11-14` — aggressor classifiers; consumers should never branch on these.
8. `computeDelta` / `computeCumulativeDelta` / `computeDiagonalImbalances` — `packages/core/src/components/footprint/index.ts:17-20` — per-bar internals.
9. `computeAnchoredZoom` — `packages/core/src/scale/index.ts:5` — math used by `ChartController.zoomTo*`. No reason for users.
10. `createOriginShiftPolicy` / `OriginShiftPolicy` — `packages/core/src/scale/index.ts:9` — explicitly documented as "managed automatically but exposed for tests" (`packages/core/src/scale/types.ts:94`). Should not be on the public surface.
11. `createSnapshotRing` / `createDeltaArchive` / `createLogColorScale` — `packages/core/src/components/orderBookHeatmap/index.ts:9-11` — internal storage primitives composed by `createHeatmapController`.
12. `createOrderBookState` — `packages/core/src/components/orderBookHeatmap/index.ts:8` — used internally; the public path is `createHeatmapController`.

Plus: `BUILTIN_LAYER_TYPES` (`packages/core/src/scene/layerRegistry.ts:99`) is exposed at top level even though no factory ever ships in this PR (per the file's own header). It will appear in users' IDE autocomplete before being usable.

**Fix:** Replace `packages/core/src/index.ts:1-13` with an **explicit** `export { … }` list. Move every leaked symbol to a `@klinechart-quant/core/internal` subpath (or `/advanced`) gated behind documentation that says "no API stability guarantees". Treat the top-level as the API contract.

### BLOCKER-003 — Mutator return values are five different conventions

**Files & verbs (one row per mutator):**
- `addRule` returns `boolean` — `packages/core/src/alerts/types.ts:155`
- `addAnchor` returns `string | null` — `packages/core/src/components/anchoredVwap/types.ts:138`
- `addSeries` returns `string` (id only; throws on collision) — `packages/core/src/components/mtfOverlay/types.ts:110`
- `add` (indicator) returns `string | null` — `packages/core/src/controllers/types.ts:95`
- `addLayer` returns `void` (silent dedupe on duplicate id) — `packages/core/src/scene/types.ts:134`, impl `packages/core/src/scene/createScene.ts:38-46`
- `setLayerVisibility` returns `boolean` (false = not found) — `packages/core/src/scene/types.ts:137`
- `updateRule` returns `boolean` — `packages/core/src/alerts/types.ts:159`
- `updateAnchor` returns `boolean` — `packages/core/src/components/anchoredVwap/types.ts:154`
- `updateSeries` returns `boolean` — `packages/core/src/components/mtfOverlay/types.ts:119`
- `updateParams` (indicator) returns `boolean` — `packages/core/src/controllers/types.ts:99`
- `register` (layer factory) returns `void` but **throws** on duplicate — `packages/core/src/scene/layerRegistry.ts:68-75`

The user cannot predict whether an "add" is going to: return a fresh id, return false, throw, return null, or silently dedupe. Four behaviours for the same surface verb is a clean-code regression.

**Fix:** Pick ONE per intent:
- `add*(def): { id: string }` for "I made one" (no failure modes — preflight checks with throw if invalid).
- `update*(id, patch): boolean` for "patch existing thing, return false if not found".
- `remove*(id): boolean`.

Cease throwing on dup-id-add (it's recoverable — make it idempotent: return existing id). Cease returning `null` for "already exists" — return the existing id. Document this once in `packages/core/src/index.ts` header.

### BLOCKER-004 — Dispose contract is non-uniform across controllers

| Controller | File:line | Post-dispose semantic |
|---|---|---|
| `VolumeProfileController` | `packages/core/src/components/volumeProfile/createVolumeProfileController.ts:192-203` | silent no-op (mutators return `undefined`) |
| `AnchoredVwapController` | `packages/core/src/components/anchoredVwap/createAnchoredVwapController.ts:331-339` | silent no-op (`addAnchor` returns `null`, `removeAnchor` returns `false`) |
| `FootprintController` | `packages/core/src/components/footprint/createFootprintController.ts:317-322` | silent no-op (per-method `if (disposed) return`) |
| `HeatmapController` | `packages/core/src/components/orderBookHeatmap/createHeatmapController.ts:234-240` | clears internal state, then silent no-op |
| `MtfController` | `packages/core/src/components/mtfOverlay/createMtfController.ts:154-157` | clears definitions Map, silent no-op |
| `AlertController` | `packages/core/src/alerts/createAlertController.ts:283-298` | silent no-op (mutators return `false`, `[]`, or `undefined`) |
| `ReplayController` | `packages/core/src/replay/createReplayController.ts:265-296` | silent no-op |
| `IndicatorSelectorController` | `packages/core/src/controllers/createIndicatorSelectorController.ts:265-287` | silent no-op |
| `ToolbarController` | `packages/core/src/controllers/createToolbarController.ts:125-135` | silent no-op |
| `DrawingController` | `packages/core/src/controllers/createDrawingController.ts:75-87` | silent no-op |
| `ChartController` | `packages/core/src/controllers/createChartController.ts:471-501` | silent no-op + `try/catch`-wrapped child disposes |
| `Scene` | `packages/core/src/scene/createScene.ts:89-106` | silent no-op + per-layer dispose swallowed |
| `PriceScale` | **`packages/core/src/scale/createPriceScale.ts:86-91, 212-214`** | **THROWS** on next mutator (`'PriceScale: instance has been disposed'`) |
| `TimeScale` | **`packages/core/src/scale/createTimeScale.ts:46-50`** | **THROWS** on next mutator (`'TimeScale: instance has been disposed'`) |

**Issue:** PriceScale & TimeScale are odd ducks. The rest of the codebase is "silent no-op" but the two scale primitives throw. A React StrictMode double-effect or an Angular DestroyRef race will crash production.

**Fix:** Pick "silent no-op" everywhere. Replace `throw new Error('PriceScale: instance has been disposed')` (`packages/core/src/scale/createPriceScale.ts:89-91`) and the same in `createTimeScale.ts:48-50` with a `disposed` early-return. Add a unit test that asserts post-dispose calls do not throw on either scale.

### BLOCKER-005 — Every error is plain `new Error(...)` — no taxonomy, no codes

**File witnesses (53 of 54 throws):** `packages/core/src/scale/createTimeScale.ts:36,48,81`, `packages/core/src/scale/createPriceScale.ts:61,66,71,89,170,181,186,191,203`, `packages/core/src/scale/originShift.ts:70,73`, `packages/core/src/components/orderBookHeatmap/createHeatmapController.ts:156,253,255,258,261,264,267`, `packages/core/src/components/orderBookHeatmap/logColorScale.ts:68,71,74`, `packages/core/src/components/orderBookHeatmap/createOrderBookState.ts:30`, `packages/core/src/components/orderBookHeatmap/snapshotRing.ts:19`, `packages/core/src/components/footprint/createFootprintController.ts:64,67,70`, `packages/core/src/components/mtfOverlay/alignToBaseIndex.ts:41,46`, `packages/core/src/components/mtfOverlay/resampleBars.ts:37,40,43`, `packages/core/src/components/mtfOverlay/createMtfController.ts:52,79,82,95,101,116`, `packages/core/src/controllers/createChartController.ts:148,222,225`, `packages/core/src/components/anchoredVwap/computeAnchoredVwap.ts:78` (the **one** `RangeError`).

Plus two custom classes that exist as one-offs:
- `ChartSerializationError` — `packages/ai-runtime/src/serialization.ts:16-23` (has a `code: string`, name = `ChartSerializationError`)
- `AlertRuleSchemaError` — `packages/core/src/alerts/ruleSchema.ts:37-42` (no `code`, name = `AlertRuleSchemaError`)

**Issue:** Consumers can't write `catch (e) { if (e instanceof KLineChartError) … }` because there is no base class. They can't `if (e.code === 'INVALID_BIN_COUNT')` because there's no code. Stripe's SDK has `StripeError`, `StripeAPIError`, `StripeAuthenticationError` — that's why their `try/catch` patterns are predictable.

**Fix:** Ship before v1:
```ts
// packages/core/src/errors.ts
export class KLineChartError extends Error {
  constructor(public readonly code: string, message: string, public readonly meta?: Record<string, unknown>) {
    super(message); this.name = 'KLineChartError';
  }
}
export class KLineChartValidationError extends KLineChartError {}
export class KLineChartDisposedError extends KLineChartError {}
```
Migrate every `throw new Error(...)` to a `KLineChartValidationError('VOLUME_PROFILE_BIN_COUNT_INVALID', ...)`. Roll the two existing custom classes (`ChartSerializationError`, `AlertRuleSchemaError`) under `KLineChartError`. Document the catalog once.

### BLOCKER-006 — Top-level `KLineData` is the wrong shape for a public bar type

**File:** `packages/core/src/controllers/types.ts:18-31`
```ts
export interface KLineData {
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume?: number
    turnover?: number
    stockCode?: string
    amplitude?: number
    changePercent?: number
    changeAmount?: number
    turnoverRate?: number
}
```

`volume` is OPTIONAL. Every other "bar" type in the codebase makes volume required (`BaseBar:30-37`, `OHLCV:40-47`, `AVWAPBar:33-38`, `VolumeProfileBar:87-92`, `FootprintBar.cells` model). The five trailing fields (`stockCode`, `amplitude`, `changePercent`, `changeAmount`, `turnoverRate`) are domain-leaks from a Chinese-stock data feed — a generic OSS product can't bake them into the canonical type.

**Fix:** Replace `KLineData` with the existing `OHLCV` (`packages/core/src/chartTypes/types.ts:40-47`) as the canonical bar. Move the trailing five fields to a `KLineDataExtended` interface or a `meta` bag. Migrate `ChartMountOptions.data` (`packages/core/src/controllers/types.ts:165`) and `ChartController.data` (`packages/core/src/controllers/types.ts:180,186-187`) to `OHLCV`. Re-export `OHLCV` from top-level as `Bar` per BLOCKER-007.

### BLOCKER-007 — Six different names for "a price bar"

| Name | File:line | Description |
|---|---|---|
| `KLineData` | `packages/core/src/controllers/types.ts:18-31` | OHLCV + 7 optional CN-stock fields; `volume?` optional |
| `OHLCV` | `packages/core/src/chartTypes/types.ts:40-47` | OHLCV; volume required |
| `BaseBar` | `packages/core/src/components/mtfOverlay/types.ts:30-37` | OHLCV; volume required |
| `AVWAPBar` | `packages/core/src/components/anchoredVwap/types.ts:33-38` | HLCV only (no open, no timestamp) |
| `VolumeProfileBar` | `packages/core/src/components/volumeProfile/types.ts:87-92` | HLCV only (no open, no timestamp) — **identical shape to AVWAPBar** |
| `ResampledBar` | `packages/core/src/components/mtfOverlay/types.ts:46-51` | `BaseBar` + `sourceStart/sourceEnd` |
| `TransformedBar` | `packages/core/src/chartTypes/types.ts:60-71` | `OHLCV` + `sourceBarIndex{Start,End}` + `meta` |
| `MarketSnapshot.bar` | `packages/core/src/alerts/types.ts:39-46` | inline anonymous OHLCV; volume required |

**Issue:** `AVWAPBar` and `VolumeProfileBar` are **structurally identical** (HLCV) but cannot be used interchangeably without casting. `OHLCV` and `BaseBar` are structurally identical (timestamp+OHLCV) but cannot be used interchangeably. `MarketSnapshot.bar` is a third copy of the same shape.

**Fix:** Define one canonical `Bar` type at `packages/core/src/types/bar.ts`:
```ts
export interface Bar { timestamp: number; open: number; high: number; low: number; close: number; volume: number }
export type HLCVBar = Pick<Bar, 'high' | 'low' | 'close' | 'volume'>  // for AVWAP, VP
export interface ResampledBar extends Bar { sourceStart: number; sourceEnd: number }
export interface TransformedBar extends Bar { sourceBarIndexStart: number; sourceBarIndexEnd: number; meta?: Readonly<Record<string, unknown>> }
```
Alias the others as `@deprecated`: `export type AVWAPBar = HLCVBar`, `export type VolumeProfileBar = HLCVBar`, `export type BaseBar = Bar`, `export type OHLCV = Bar`. Delete in v2. Replace inline `MarketSnapshot.bar` with `Bar | null`.

### BLOCKER-008 — Optional-field shape is inconsistent: `T | null` vs `?: T` vs `undefined`

Audit of the four examples listed in the brief plus the most-visible others:

| Field | File:line | Shape |
|---|---|---|
| `VolumeProfileState.state` | `packages/core/src/components/volumeProfile/types.ts:103` | `Signal<VolumeProfileState \| null>` (explicit null) |
| `HeatmapState.latestSnapshot` | `packages/core/src/components/orderBookHeatmap/types.ts:134` | `BookSnapshot \| null` (explicit null) |
| `MarketSnapshot.bar` | `packages/core/src/alerts/types.ts:39-46` | inline `{...} \| null` (explicit null) |
| `MarketSnapshot.volumeProfile` | `packages/core/src/alerts/types.ts:56` | **`?: {...}`** (optional) |
| `MarketSnapshot.orderBook` | `packages/core/src/alerts/types.ts:57-62` | **`?: {...}`** (optional) |
| `MarketSnapshot.footprint` | `packages/core/src/alerts/types.ts:63-66` | **`?: {...}`** (optional) |
| `FootprintBar.imbalances` | `packages/core/src/components/footprint/types.ts:144` | always present (never absent), even if empty array |
| `OrderBookDelta.timestamp` | `packages/core/src/components/orderBookHeatmap/types.ts:33` | required `number` |
| `AlertRule.cooldownMs` | `packages/core/src/alerts/types.ts:129` | optional `?: number` |
| `AlertRule.metadata` | `packages/core/src/alerts/types.ts:131` | optional `?: Readonly<…>` |
| `AlertEvent.metadata` | `packages/core/src/alerts/types.ts:141` | optional `?: Readonly<…>` |
| `KLineData.volume` | `packages/core/src/controllers/types.ts:24` | optional `?: number` |
| `ChartMountOptions.theme` | `packages/core/src/controllers/types.ts:168` | optional `?:` |
| `DrawingState.activeTool` | `packages/core/src/controllers/types.ts:147` | **explicit `| null`** |
| `ToolbarController.activeTool` | `packages/core/src/controllers/types.ts:131` | **explicit `| null`** |
| `AnchorDefinition.color` | `packages/core/src/components/anchoredVwap/types.ts:90` | optional `?: string` |

**Issue:** `MarketSnapshot.bar` is `null` but `MarketSnapshot.volumeProfile` is `?:`. Both mean "not present". TypeScript treats them differently (`bar` must be explicitly written; `volumeProfile` may be elided). Consumers writing `if (snap.bar) { … }` and `if (snap.volumeProfile) { … }` will guess wrong half the time.

**Fix:** Convention (commit it in `docs/api-style.md`):
- **`?: T`** for fields a caller MAY omit (constructor inputs, options bags).
- **`T | null`** for reactive snapshots where "no value yet" is observable state.

Apply: change `MarketSnapshot.{volumeProfile,orderBook,footprint}` to `T | null` (since they ARE observable state). Keep `cooldownMs` and `metadata` as `?:` (caller omissions). Keep `theme`, `initialZoomLevel` as `?:`.

### BLOCKER-009 — `Computed<T>` is reachable but not part of the contract

**File:** `packages/core/src/reactivity/signal.ts:24-28, 91-106`
```ts
export type Computed<T> = { (): T; peek: () => T; subscribe: (l: () => void) => () => void }
export function computed<T>(fn: () => T): Computed<T>
```
exported via `packages/core/src/reactivity/index.ts:2`.

But `createIndicatorSelectorController.ts:117-135` wraps `computed()` into a fake `Signal<T>` via `toReadonlySignal`:
```ts
function toReadonlySignal<T>(c: ReturnType<typeof computed<T>>): Signal<T> {
    return Object.assign(read, { peek: c.peek, subscribe: c.subscribe, set: (_: T) => {} /* derived — no-op */ })
}
```
i.e. the codebase ALREADY decided that the public contract is `Signal<T>` — but `Computed<T>` still bleeds out. Users will reach for it, write code against it, and find that all controllers expose `Signal<T>` instead. The two abstractions either need to merge or one needs to be deleted.

**Fix:** Delete the `Computed<T>` export from `packages/core/src/reactivity/index.ts:2`. Keep `computed()` itself, return-typed as `Signal<T>` (with a no-op `set`, matching `toReadonlySignal`). Single reactive type on the public surface — `Signal<T>`.

### BLOCKER-010 — `ChartController` has no `setBars` despite mounting via `ChartMountOptions.data`

**File:** `packages/core/src/controllers/types.ts:165, 186-187`
`ChartController.setData(next)` / `appendData(next)` exist, but the per-component vocabulary is `setBars` / `appendBar`. Top-level chart uses "data", everything below uses "bars". One name, please.

**Fix:** Rename `setData` → `setBars` and `appendData` → `appendBars` on `ChartController` to match the rest of the codebase. Or, conversely, rename `setBars` → `setData` etc. on every component. The author's choice — but pick one before v1.

---

## MAJORS

### MAJOR-001 — Factory parameter name varies between `config`, `init`, `opts`, `options`

| Factory | File:line | Param name |
|---|---|---|
| `createTimeScale` | `packages/core/src/scale/createTimeScale.ts:30` | `config: TimeScaleConfig` |
| `createPriceScale` | `packages/core/src/scale/createPriceScale.ts:54` | `config: PriceScaleConfig` |
| `createOriginShiftPolicy` | `packages/core/src/scale/originShift.ts:65` | `initialRef: number, threshold?: number` (positional!) |
| `createAlertController` | `packages/core/src/alerts/createAlertController.ts:48` | `opts?: AlertControllerOptions` |
| `createHeatmapController` | `packages/core/src/components/orderBookHeatmap/createHeatmapController.ts:46` | `init?: Partial<HeatmapControllerConfig>` |
| `createLogColorScale` | `packages/core/src/components/orderBookHeatmap/logColorScale.ts:21` | `sizeMin: number, sizeMax: number` (positional!) |
| `createOrderBookState` | `packages/core/src/components/orderBookHeatmap/createOrderBookState.ts:27` | `opts: OrderBookStateOptions` |
| `createDeltaArchive` | `packages/core/src/components/orderBookHeatmap/deltaArchive.ts:28` | `opts?: DeltaArchiveOptions` |
| `createSnapshotRing` | `packages/core/src/components/orderBookHeatmap/snapshotRing.ts:17` | `capacity: number` (positional!) |
| `createVolumeProfileController` | `packages/core/src/components/volumeProfile/createVolumeProfileController.ts:53` | `init?: VolumeProfileControllerInit` |
| `createFootprintController` | `packages/core/src/components/footprint/createFootprintController.ts:88` | `init: Partial<FootprintConfig>` (REQUIRED, but the doc says optional) |
| `createMtfController` | `packages/core/src/components/mtfOverlay/createMtfController.ts:31` | `init: CreateMtfControllerInit = {}` |
| `createAnchoredVwapController` | `packages/core/src/components/anchoredVwap/createAnchoredVwapController.ts:60` | `opts?: AnchoredVwapControllerInit` |
| `createReplayController` | `packages/core/src/replay/createReplayController.ts:85` | `init?: ReplayControllerInit` |
| `createScene` | `packages/core/src/scene/createScene.ts:24` | (no args) |
| `createLayerRegistry` | `packages/core/src/scene/layerRegistry.ts:62` | (no args) |
| `createSignal` | `packages/core/src/reactivity/signal.ts:37` | `initial: T` (positional) |
| `createChartController` | `packages/core/src/controllers/createChartController.ts:220` | `opts: ChartMountOptions` |
| `createToolbarController` | `packages/core/src/controllers/createToolbarController.ts:35` | `init: ToolbarInit` (REQUIRED) |
| `createIndicatorSelectorController` | `packages/core/src/controllers/createIndicatorSelectorController.ts:80` | `initial?: IndicatorSelectorInit` |
| `createDrawingController` | `packages/core/src/controllers/createDrawingController.ts:37` | `init?: DrawingInit` |

**Issue:** `config`, `init`, `opts`, `options`, `initial`. Mix of required vs optional, positional vs object. Discoverability ZERO.

**Fix:** Convention:
- All factory params named `init` (not `config`, not `opts`).
- All optional with `= {}` default — `createX(init: XInit = {})`.
- Forbidden: positional primitive args. `createSignal<T>(initial: T)` is the only justifiable exception, and even then `createSignal<T>(init: { initial: T })` is cleaner.

### MAJOR-002 — Factory configuration type name varies: `Init` vs `Config` vs `Options`

Listing the suffix used per factory:

| Factory | Type suffix |
|---|---|
| `createTimeScale` | `Config` (`TimeScaleConfig`) |
| `createPriceScale` | `Config` (`PriceScaleConfig`) |
| `createAlertController` | `Options` (`AlertControllerOptions`) |
| `createHeatmapController` | `Config` (`HeatmapControllerConfig`) |
| `createOrderBookState` | `Options` (`OrderBookStateOptions`) |
| `createDeltaArchive` | `Options` (`DeltaArchiveOptions`) |
| `createVolumeProfileController` | `Init` (`VolumeProfileControllerInit`) |
| `createFootprintController` | `Config` (`FootprintConfig`) |
| `createMtfController` | `Init` (`CreateMtfControllerInit`) |
| `createAnchoredVwapController` | `Init` (`AnchoredVwapControllerInit`) |
| `createReplayController` | `Init` (`ReplayControllerInit`) |
| `createChartController` | `Options` (`ChartMountOptions`) |
| `createToolbarController` | `Init` (`ToolbarInit`) |
| `createIndicatorSelectorController` | `Init` (`IndicatorSelectorInit`) |
| `createDrawingController` | `Init` (`DrawingInit`) |

**Issue:** Same problem as MAJOR-001 at the type-name layer.

**Fix:** Pick ONE suffix. Recommendation: `Init` — matches what most of the controller layer already uses. Migrate `Config`/`Options`/`Mount` to `Init`. Exception: `FootprintConfig` and `VolumeProfileConfig` are **reactive state** (`config: Signal<FootprintConfig>`) — these are state, not constructor input, and should keep `Config` as a suffix. The constructor input becomes `FootprintInit { config?: Partial<FootprintConfig> }` — exactly mirroring `VolumeProfileControllerInit { config?: Partial<…> }`.

### MAJOR-003 — `LayerRegistry.register` throws on duplicate; `Scene.addLayer` silently dedupes

**Files:**
- `packages/core/src/scene/layerRegistry.ts:68-75` (throws)
- `packages/core/src/scene/createScene.ts:38-46` (silent skip)

Same semantic intent ("don't register me twice"), two opposite behaviours.

**Fix:** Choose one — silent dedupe everywhere (consistent with PROJECT convention of "dispose silent no-op"). Document.

### MAJOR-004 — `addLayer` returns `void` but the rest of the same module returns `boolean`

**File:** `packages/core/src/scene/types.ts:134-137`
```ts
addLayer(layer: Layer): void
removeLayer(id: string): boolean
setLayerVisibility(id: string, visible: boolean): boolean
```

Add doesn't tell you whether it succeeded (because of MAJOR-003's silent dedupe). Remove and setLayerVisibility do.

**Fix:** Make `addLayer` return `boolean` (`true` on insert, `false` on dedupe) — or return `string | null` (id on insert, null on dedupe), matching `IndicatorSelectorController.add`.

### MAJOR-005 — Layer's `visible` field is mutable in the interface

**File:** `packages/core/src/scene/types.ts:110` `visible: boolean` (no `readonly`)

But the controller mutates it via `setLayerVisibility` (`packages/core/src/scene/createScene.ts:63-73`), AND adapters can mutate it directly because it's a public field. Two paths to mutate the same field; subscribers of `layers` signal don't fire on direct mutation (per the controller's comment "subscribers care about membership, not field state" — `createScene.ts:69-72`). That's a footgun.

**Fix:** Make `Layer.visible` `readonly`. Force all visibility flips through `setLayerVisibility`. If you want to keep direct mutation, document that subscribers won't fire — but that's bad. Better to lock it down.

### MAJOR-006 — `ai-runtime` `describe*` naming is incoherent

**File:** `packages/ai-runtime/src/index.ts:28-37`, definitions in `packages/ai-runtime/src/describeControllers.ts`:
- `describeVolumeProfileState(state)` — accepts a state snapshot, name says "State"
- `describeAnchoredVwap(anchors, latestPrice)` — no "State" suffix, accepts a list + a price
- `describeFootprintLatestBar(bar, cumulativeDelta)` — neither plural nor "State"; specific to "latest bar"
- `describeAlerts(state)` — plural; accepts a state snapshot

Plus the snapshot input type names diverge too:
- `VolumeProfileSnapshot` — `describeControllers.ts:24-30`
- `AnchoredVwapSeriesSnapshot` — `describeControllers.ts:68-76` (note `Series` infix)
- `FootprintLatestBarSnapshot` — `describeControllers.ts:118-124` (specific scope)
- `AlertSnapshot` — `describeControllers.ts:169-173`

**Issue:** The header comment at `packages/ai-runtime/src/describeControllers.ts:14-16` literally states "Naming convention: every fn is `describe<Controller>State(stateSnapshot)`" — and then immediately violates it three times out of four.

**Fix:** Adopt `describe<ControllerId>State(snapshot)` uniformly:
- `describeVolumeProfileState(snapshot)` ✅
- `describeAnchoredVwapState(snapshot)` ← rename, snapshot becomes `{ anchors, latestPrice }`
- `describeFootprintState(snapshot)` ← rename, snapshot includes `latestBar, cumulativeDelta`
- `describeAlertsState(snapshot)` ✅ (rename `describeAlerts` → `describeAlertsState`)

Match the snapshot input types: `VolumeProfileStateSnapshot`, `AnchoredVwapStateSnapshot`, `FootprintStateSnapshot`, `AlertsStateSnapshot`. One pattern.

### MAJOR-007 — `MarketSnapshot` is a structural one-off duplicating the `Bar` type

**File:** `packages/core/src/alerts/types.ts:39-46`
The inline `bar: { timestamp; open; high; low; close; volume } | null` is the SIXTH copy of the canonical bar shape — see BLOCKER-007. The alerts module should import `Bar` from a single source.

**Fix:** Once BLOCKER-007 ships, `bar: Bar | null` here.

### MAJOR-008 — `AlertController.onEvent` callback is the only "subscribe to events" path; signals + callbacks coexist

**File:** `packages/core/src/alerts/types.ts:152, 169`
```ts
readonly events: Signal<ReadonlyArray<AlertEvent>>   // reactive ring buffer
onEvent(listener: (event: AlertEvent) => void): () => void  // per-event callback
```

Two ways to observe the same thing. `events` is a ring → useful for UI lists. `onEvent` is fire-and-forget → useful for side effects. They are NOT equivalent: `events` is bounded (`maxEvents` default 100), so a slow subscriber sees only the last 100. `onEvent` sees everything, but only post-subscribe.

**Issue:** Underspecified. Which one should a consumer use? `useChart` doesn't know.

**Fix:** Document both clearly in `AlertController` JSDoc (currently `packages/core/src/alerts/types.ts:148-172` has zero text on which to use when). State the difference: `events` is the "what's in the buffer" reactive snapshot; `onEvent` is the "fire on every new event" hook. Add an example.

### MAJOR-009 — `BookSnapshot` is `readonly` deep but `OrderBookState.snapshot()` returns a fresh allocation every call

**Files:**
- `packages/core/src/components/orderBookHeatmap/types.ts:48-52` (`BookSnapshot.bids/asks readonly`)
- `packages/core/src/components/orderBookHeatmap/createOrderBookState.ts:74-94, 96-102` (`sortAndTruncate` runs `Array.from` + sort + dequantize on every snapshot)

**Issue:** `snapshot()` is documented as "Take a fresh snapshot" (`types.ts:69`) but a high-throughput consumer that calls it per frame is going to walk both Maps, sort them, allocate arrays, allocate tuples, and run `Math.pow` per level. That cost is hidden in a method name that implies cheap.

**Fix:** Either (a) memoise within `OrderBookState` until next `applyDelta`, or (b) rename to `materialiseSnapshot()` so the cost is in the name, or (c) document the cost in the JSDoc explicitly. The `HeatmapController` already pulls snapshots from a `ring`, so its hot path is fine — this is for direct `createOrderBookState` consumers.

### MAJOR-010 — `MtfController.addSeries` throws on dup id but `AnchoredVwapController.addAnchor` replaces-in-place

**Files:**
- `packages/core/src/components/mtfOverlay/createMtfController.ts:115` (`throw new Error('MtfController.addSeries: id "${def.id}" already in use')`)
- `packages/core/src/components/anchoredVwap/createAnchoredVwapController.ts:259-275` ("Replace-in-place on id collision. The brief allows either semantics; we choose replace")

These two controllers solve the same "user dragged an anchor onto an existing one" problem in opposite ways.

**Fix:** Pick one. Replace-in-place is friendlier (idempotent); throw-on-dup is safer (no silent overwrite). Recommendation: replace-in-place everywhere, return the id. Document.

### MAJOR-011 — `ChartController.zoomToLevel(level, anchorX?)` mixes a number-id and a logical-pixel coordinate

**File:** `packages/core/src/controllers/types.ts:189-191`
```ts
zoomToLevel(level: number, anchorX?: number): void
zoomIn(anchorX?: number): void
zoomOut(anchorX?: number): void
```

Both args are `number`. The user can call `chart.zoomToLevel(800, 5)` thinking `800` is anchorX. There's no type-level guard.

**Fix:** Replace with an object arg: `zoomTo(opts: { level: number; anchorX?: number })`. Branded type `LogicalPx = number & { __brand: 'LogicalPx' }` is overkill but would catch this.

### MAJOR-012 — `ChartMountOptions.data` is an array — no streaming dataSource

**File:** `packages/core/src/controllers/types.ts:163-169`
```ts
export interface ChartMountOptions {
  container: HTMLElement
  data: ReadonlyArray<KLineData>
  initialZoomLevel?: number
  zoomLevels?: number
  theme?: 'light' | 'dark'
}
```

There is no `dataSource: AsyncIterable<Bar>` or `dataSource: Observable<Bar>` field. Adding one in v1.1 is a breaking change to the type (because adding a required field is BC-breaking; adding an optional field is OK but only if no other field has the same role). Right now, the "feed live data" story is "build the chart, then call `setData` / `appendData` over time" — which means an SSR / first-paint cycle is forced.

**Fix:** Add `dataSource?: AsyncIterable<Bar> | Observable<Bar>` BEFORE v1, even if the impl just consumes the iterable into `appendData` calls. Otherwise the v1 contract bakes in the "always preload all bars" model.

### MAJOR-013 — `setData` / `setBars` / `setBaseBars` are not abortable

Every "replace whole dataset" mutator on every controller does a synchronous, blocking from-scratch recompute. There is no `AbortSignal`. For a 1M-bar Volume Profile (`packages/core/src/components/volumeProfile/createVolumeProfileController.ts:75-160`) that's two O(N) passes; not free. If the user switches symbols mid-compute, the wasted work is unrecoverable.

**Fix:** Add `signal?: AbortSignal` to every `set*` and the `transform` family. The math is currently synchronous, so the signal would only be checked at loop boundaries — but even a 64K-bar yield point is worth it.

### MAJOR-014 — `evaluate` on `AlertController` is the only mutator that returns an array

**File:** `packages/core/src/alerts/types.ts:165` `evaluate(snapshot, now): ReadonlyArray<AlertEvent>`

Every other mutator returns `void`, `boolean`, or `string | null`. `evaluate` is a hybrid: it mutates (rules can be auto-disabled when oneShot fires, events ring grows) AND returns the fired events. Two responsibilities.

**Fix:** Split: `evaluate(snapshot, now): void` (commits to signals; subscribers observe). Drop the array return — consumers use `onEvent` for per-event callbacks. Or rename to `evaluateAndCollect` to make the hybrid explicit.

### MAJOR-015 — `ReplayController.tick(deltaMs)` returns boolean, no other mutator does

**File:** `packages/core/src/replay/types.ts:96-97`
`tick(deltaMs: number): boolean` — `true` if position changed.

Every other mutator on every other controller returns `void` (for "just commit") or `boolean` (for "did this exist"). `tick` is the only frame-loop hook + the only commit that signals progress.

**Fix:** Either (a) keep `tick` as-is (justifiable for frame-loop integration) and document that this is the ONE intentional exception, or (b) remove the return and have callers diff `state` themselves.

### MAJOR-016 — `dispose` is missing on `ChartTypeTransform`

**File:** `packages/core/src/chartTypes/types.ts:85-99`
```ts
export interface ChartTypeTransform<TConfig = unknown> {
  readonly typeId: string
  transform(input, config): ReadonlyArray<TransformedBar>
  appendBar?(input): ReadonlyArray<TransformedBar>
  reset?(): void
}
```

`HeikinAshi`, `Renko`, `RangeBars`, `PointAndFigure` all hold mutable internal state (ATR window, brick state, etc.) but expose no `dispose`. A long-running app that swaps chart types leaks the closure scope every swap.

**Fix:** Add `dispose?(): void`. Existing transforms can implement as `reset()`. Future ones (GPU compute paths) will need it.

### MAJOR-017 — Adapter packages do not re-export the seven advanced controllers' types

**File:** `packages/react/src/index.ts:29-33` — only re-exports `ChartController`, `ChartMountOptions`, `IndicatorSelectorController`. The seven hooks (`useAlerts`, `useReplay`, `useFootprint`, `useVolumeProfile`, `useAnchoredVwap`, `useOrderBookHeatmap`, `useMtfOverlay`) take controllers as arguments — but consumers must import the controller types from `@klinechart-quant/core`. Same issue in `packages/vue/src/index.ts:35-39` and `packages/angular/src/index.ts:36`.

**Fix:** Re-export `AlertController`, `ReplayController`, `FootprintController`, `VolumeProfileController`, `AnchoredVwapController`, `HeatmapController`, `MtfController` from each adapter, plus their state / config types. Eliminates the "do I import from `@kc/core` or `@kc/react`" guess.

### MAJOR-018 — No top-level `Bar` export from `@klinechart-quant/core` — every consumer imports `KLineData`

**File:** `packages/core/src/controllers/index.ts:2` (`KLineData` re-exported)

Per BLOCKER-007, `KLineData` is the wrong name. The package's #1 type — the bar — is named after the legacy Chinese stock domain. Every adapter (`packages/react/src/hooks/useChart`, etc.) imports `KLineData`.

**Fix:** Add `export type { Bar } from './types/bar'` to top-level. Recommend it as the new canonical name. `KLineData` becomes a `@deprecated` alias.

### MAJOR-019 — JSDoc coverage is uneven across types

Sample of 20 exported symbols and JSDoc status:

| Symbol | File:line | Has WHAT + WHEN JSDoc? |
|---|---|---|
| `ChartController` | `packages/core/src/controllers/types.ts:178` | Header only, no per-method JSDoc on `setData`/`appendData`/`setTheme`/`zoomToLevel`/`zoomIn`/`zoomOut` ❌ |
| `IndicatorSelectorController.add` | `packages/core/src/controllers/types.ts:95` | One-line ✅ |
| `IndicatorSelectorController.reorder` | `packages/core/src/controllers/types.ts:101` | One-line ✅ |
| `ToolbarController.selectTool` | `packages/core/src/controllers/types.ts:134` | None ❌ |
| `DrawingController.setActiveTool` | `packages/core/src/controllers/types.ts:153` | None ❌ |
| `VolumeProfileController.ingest` | `packages/core/src/components/volumeProfile/types.ts:111` | Multi-line ✅ |
| `AnchoredVwapController.setBars` | `packages/core/src/components/anchoredVwap/types.ts:127` | Multi-line ✅ |
| `MtfController.setBaseBars` | `packages/core/src/components/mtfOverlay/types.ts:103` | Multi-line ✅ |
| `FootprintController.ingestTrade` | `packages/core/src/components/footprint/types.ts:202` | Multi-line ✅ |
| `HeatmapController.ingestDelta` | `packages/core/src/components/orderBookHeatmap/types.ts:142` | None ❌ |
| `HeatmapController.forceSnapshot` | `packages/core/src/components/orderBookHeatmap/types.ts:144` | One-line ✅ |
| `HeatmapController.replay` | `packages/core/src/components/orderBookHeatmap/types.ts:149` | Multi-line ✅ |
| `OrderBookState.applyDelta` | `packages/core/src/components/orderBookHeatmap/types.ts:67` | One-line ✅ |
| `AlertController.evaluate` | `packages/core/src/alerts/types.ts:165` | Multi-line ✅ |
| `AlertController.addRule` | `packages/core/src/alerts/types.ts:155` | One-line ✅ |
| `ReplayController.seekTo` | `packages/core/src/replay/types.ts:65` | One-line ✅ |
| `ReplayController.tick` | `packages/core/src/replay/types.ts:96` | Multi-line ✅ |
| `Scene.addLayer` | `packages/core/src/scene/types.ts:134` | None ❌ |
| `Scene.paintPane` | `packages/core/src/scene/types.ts:140` | One-line ✅ |
| `Renderer.beginFrame` | `packages/core/src/render/Renderer.ts:119` | Group header only, no per-method ❌ |

**Stats:** 14/20 = 70% have at least one-line JSDoc. **6/20 = 30% missing**. The IDE intellisense gap is concentrated in `ChartController` (the most-imported type) and `Scene` (the most-extended interface).

**Fix:** Mandate per-method JSDoc on every exported interface method. Document a one-line minimum: "what the method does + when to call it".

### MAJOR-020 — `ChartController` lacks dispose-safety on `setTheme` and other mutators when child controllers are dead

**File:** `packages/core/src/controllers/createChartController.ts:471-501`

`dispose()` is non-async, calls child disposes inside `try/catch`, but `chart.destroy()` (the legacy engine call at `:477`) IS async — the comment says "we don't await". If a consumer calls `setTheme` between `dispose()` returning and `chart.destroy()` actually finishing, the `disposed` flag is true so `setTheme` is a no-op (✅), but the legacy engine may still emit `setOnDataChange` callbacks into `data.set(...)` (`createChartController.ts:339-341`). That fires post-dispose listeners — the silent no-op guarantee is broken at the callback bridge.

**Fix:** Inside the bridge callbacks at `createChartController.ts:322-341`, wrap with `if (disposed) return`. Currently disposed-check is only inside the public-facing mutators.

### MAJOR-021 — `provideKLineChart` (Angular) is named after the legacy framework, not the new product

**File:** `packages/angular/src/index.ts:77`
`provideKLineChart({ theme, factory })` is the DI provider. But the package is `@klinechart-quant/angular`. Either the package or the provider should be renamed for consistency. The Vue plugin name `KMapPlugin` (`packages/vue/src/index.ts:319`) is ALSO inconsistent — `KMap`, `KLineChart`, `KLineChartQuant` are three different brand strings inside this repo.

**Fix:** Settle the brand for v1. Recommendation: `KLineChart` everywhere (Vue plugin → `KLineChartPlugin`, Angular provider → `provideKLineChart`). The "Quant" in the org name is fine; using it in symbol names is noise.

### MAJOR-022 — `ChartControllerFactory` is the only `Factory` named symbol; other modules implicitly type-erase factories

**File:** `packages/core/src/controllers/types.ts:202`
```ts
export type ChartControllerFactory = (opts: ChartMountOptions) => ChartController
```

But the seven advanced controllers all have a `create*` function with no exported `Factory` type. Tests/mocks need to type the factory; they have to inline `typeof createX`.

**Fix:** Export a `Factory` type for each controller:
```ts
export type AlertControllerFactory = (init?: AlertControllerInit) => AlertController
export type VolumeProfileControllerFactory = (init?: VolumeProfileControllerInit) => VolumeProfileController
// …
```

This is a precondition for the AI-runtime / DI patterns to work cleanly.

---

## MINORS

### MINOR-001 — Inconsistent `id`/`Id` casing in type names: `ToolId` vs `definitionId` vs `instanceId`

**Files:** `packages/core/src/controllers/types.ts:117` (`type ToolId`), `:95` (`definitionId`), `:97` (`instanceId`).
`ToolId` is a type alias; `definitionId` and `instanceId` are field names. The capitalisation rule (PascalCase for types, camelCase for fields) is fine, but `ToolId` is the ONLY string-type alias for an id — other ids are just `string`. Either alias all of them (`AnchorId = string`, `RuleId = string`) or none.

### MINOR-002 — `DrawingToolType` is a union with only 5 members but doesn't include common shapes

**File:** `packages/core/src/controllers/types.ts:144` `'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow'`
Missing: `vertical`, `parallel-channel`, `regression`, `text`, `circle`, `ellipse`. The doc comment says it was "extracted from drawing/plugin.ts" — the legacy plugin almost certainly has more. Surface lock-in: adding more later requires a minor bump because consumers will narrow on this union.

**Fix:** Allow extension: `DrawingToolType = …builtins | (string & {})` so consumers can supply unknown strings without TS error, OR ship the full list now.

### MINOR-003 — `BufferUsage` union covers GPU but lacks `index-uniform` / `read-write` distinction

**File:** `packages/core/src/render/Renderer.ts:52` `'vertex' | 'instance' | 'index' | 'uniform' | 'storage'`
WebGPU separates `storage-read` and `storage-write`; this union flattens them.

**Fix:** Add `'storage-read'` / `'storage-write'` or document that `'storage'` implies read-write.

### MINOR-004 — `RendererCapabilities.name` is `string` not a union

**File:** `packages/core/src/render/Renderer.ts:41` `name: string`
The JSDoc says "Friendly name, e.g. 'webgl2' or 'webgpu'". A union (`'webgl2' | 'webgpu' | 'noop'`) would let consumers exhaustively `switch`.

**Fix:** `name: 'webgl2' | 'webgpu' | (string & {})`.

### MINOR-005 — `createOriginShiftPolicy(initialRef, threshold?)` is positional

**File:** `packages/core/src/scale/originShift.ts:65`
Per MAJOR-001, all factories should be object-arg.

### MINOR-006 — `createLogColorScale(sizeMin, sizeMax)` is positional

**File:** `packages/core/src/components/orderBookHeatmap/logColorScale.ts:21`
Same as MINOR-005.

### MINOR-007 — `createSnapshotRing(capacity)` is positional

**File:** `packages/core/src/components/orderBookHeatmap/snapshotRing.ts:17`
Same as MINOR-005.

### MINOR-008 — `__setChartFactory` is React-only; Vue uses `__setControllerFactory`; Angular uses DI token

**Files:**
- `packages/react/src/index.ts:49` `__setChartFactory`
- `packages/vue/src/index.ts:56` `__setControllerFactory`
- `packages/angular/src/index.ts:58-61` `KLINE_CHART_FACTORY` InjectionToken

Three different mechanisms to inject the same factory.

**Fix:** Pick one symbol name for the "underscore-prefixed test escape hatch" across React + Vue (Angular has DI for its own reasons). Recommend `__setChartFactory` in both.

### MINOR-009 — `<KLineChart>` Vue component emits `zoomLevelChange` but core uses `viewport`

**File:** `packages/vue/src/index.ts:236-238`
```ts
emits: { ready, zoomLevelChange: (level: number, kWidth: number) => true }
```

`zoomLevelChange` is a Vue-only invention; the core emits `viewport: Signal<ChartViewport>`. Adapter-specific naming.

**Fix:** Either emit `viewportChange(vp: ChartViewport)` (matches core) or alias both for back-compat.

### MINOR-010 — `addAnchor` returns `string | null` but never null on the success path (only null after dispose)

**File:** `packages/core/src/components/anchoredVwap/types.ts:138` and impl `createAnchoredVwapController.ts:259-275`
The JSDoc says "Returns the anchor's id (the same one passed in `def.id`). If an anchor with the same id already exists it is replaced". And "Returns `null` after dispose". So the ONLY null path is dispose. That's the same as silent no-op — except for a return signature that forces all callers to null-check.

**Fix:** Return `string` and have post-dispose return the passed-in id (silent no-op). Caller cannot tell apart "added" from "dispose-noop", which matches the rest of the codebase.

### MINOR-011 — `AlertController.evaluate` signature has `now: number` but `triggeredAt` field uses same units, undocumented

**File:** `packages/core/src/alerts/types.ts:165` `evaluate(snapshot, now)` — but `now: number`, no JSDoc saying it's epoch ms.

**Fix:** Document. `now: number /* epoch ms */`.

### MINOR-012 — `BookSnapshot.bids` / `asks` use tuple type `readonly [number, number]` instead of named type

**File:** `packages/core/src/components/orderBookHeatmap/types.ts:49-50`
`ReadonlyArray<readonly [number, number]>` — position 0 is price, 1 is size. Caller has to know.

**Fix:** `export type BookLevel = { price: number; size: number }` — destructurable, self-documenting. Object literal cost is 1 free in V8 for this scale.

### MINOR-013 — `replay()` takes a `snapshotIntervalMs` arg that shadows the controller's config field

**File:** `packages/core/src/components/orderBookHeatmap/types.ts:149-153`
```ts
replay(fromTimestamp, toTimestamp, snapshotIntervalMs): ReadonlyArray<BookSnapshot>
```
But the controller already has `HeatmapControllerConfig.snapshotIntervalMs` (`:127`). Why is replay decoupled? Footgun: caller can replay at a different cadence than the live ring, getting a mismatched grid.

**Fix:** Default to `config.snapshotIntervalMs`. Make the arg optional: `replay(from, to, opts?: { snapshotIntervalMs?: number })`.

### MINOR-014 — `RangeError` (one site) vs `Error` (53 sites)

**File:** `packages/core/src/components/anchoredVwap/computeAnchoredVwap.ts:78`
The only `RangeError` in the entire core package. Per BLOCKER-005 the whole error story needs work; this is the smallest fix — pick `Error` or `RangeError` consistently for "param out of range".

### MINOR-015 — `OrderBookState.snapshot()` allocates `EMPTY` constant but the type is `ReadonlyArray<readonly [number, number]>`

**File:** `packages/core/src/components/orderBookHeatmap/createOrderBookState.ts:24, 78` 
```ts
const EMPTY: ReadonlyArray<readonly [number, number]> = []
```
The shared empty saves 2 allocations per empty-side snapshot. But the type lets the consumer push into it via `Array.isArray + cast` — minor footgun. `Object.freeze([])` would harden.

### MINOR-016 — `HeatmapState.snapshotCount` and `deltaCount` are observable but `latestSnapshot` is the only "actual data"

**File:** `packages/core/src/components/orderBookHeatmap/types.ts:133-137`
Three fields on `HeatmapState`, two of them are pure counters. Consumers wanting "rerender when a new snapshot arrives" will subscribe to the whole state, but they don't care about `deltaCount` ticking. Wasted notifications.

**Fix:** Split into two signals: `latestSnapshot: Signal<BookSnapshot | null>` and `metrics: Signal<{ snapshotCount, deltaCount }>`. Subscribers pick.

### MINOR-017 — `IndicatorSelectorController.filteredMain` / `filteredSub` are signals but are derived; consumers can't tell

**File:** `packages/core/src/controllers/types.ts:91-92` `filteredMain: Signal<…>`, `filteredSub: Signal<…>`

The implementation wraps them in a fake `Signal` whose `.set()` is a no-op (`createIndicatorSelectorController.ts:104-115`). The interface doesn't reveal this. If a caller writes `controller.filteredMain.set([...new])`, nothing happens, no error.

**Fix:** Either (a) expose them as `Computed<T>` (which has no `.set`) — but per BLOCKER-009 we want to remove `Computed`, OR (b) keep the `Signal` shape but explicitly document "writes are no-ops on derived signals" in the interface.

### MINOR-018 — `createScene()` takes no args but other controllers take `init`

**File:** `packages/core/src/scene/createScene.ts:24`
Inconsistency: every other factory takes an init or config; `createScene()` takes nothing. Future extension (initial layers? a default `paintPane` order?) will break the signature.

**Fix:** `createScene(init: SceneInit = {})` — empty interface today, expandable tomorrow.

### MINOR-019 — `createLayerRegistry()` same problem

**File:** `packages/core/src/scene/layerRegistry.ts:62`
Same — `createLayerRegistry(init: LayerRegistryInit = {})`.

### MINOR-020 — `JsonSchema` (ai-runtime) is a narrow custom subset, not real JSON Schema

**File:** `packages/ai-runtime/src/types.ts:59-68`
Documented as "JSON Schema draft 2020-12 — the only flavour every LLM provider agrees on" but the type omits `$ref`, `$id`, `format`, `pattern`, `const`. It WILL fail validation against a real JSON Schema validator. Re-exporting it as `JsonSchema` is misleading.

**Fix:** Rename to `LlmToolJsonSchema` or `NarrowJsonSchema` to advertise its subset nature. Or take a `Record<string, unknown>` to allow the consumer to embed any keyword.

### MINOR-021 — `safety` enum on `McpToolSchema` is hardcoded to three values without explanation of the cost taxonomy

**File:** `packages/ai-runtime/src/types.ts:52` `'readonly' | 'mutates-state' | 'destroys-state'`
Where does `'destroys-state'` fit? `chart.dispose` is the only example given in code comments — but `reset()` on Volume Profile (`packages/core/src/components/volumeProfile/types.ts:121`) is "destroys state" too (clears buckets). The taxonomy is fuzzy.

**Fix:** Document the rule. Recommend: `readonly` (queries), `mutates` (idempotent reversible), `destructive` (irreversible). Apply consistently.

### MINOR-022 — `__brand` is used on `BufferHandle` / `PipelineHandle` but not on other ids

**Files:**
- `packages/core/src/render/Renderer.ts:46-50` — `BufferHandle = { readonly __brand: 'BufferHandle' }`
- vs `packages/core/src/controllers/types.ts:117` — `ToolId = string` (no brand)
- vs `packages/core/src/components/anchoredVwap/types.ts:83` — `AnchorDefinition.id: string` (no brand)

Inconsistent: render uses nominal typing, controllers don't.

**Fix:** Either brand all opaque ids (recommended for type safety) or none.

### MINOR-023 — `BarCalendar` (replay timeline) is exported but the interface body lives in `timeline.ts` and is undocumented at the barrel

**File:** `packages/core/src/replay/index.ts:15` re-exports `BarCalendar` but the type's purpose is only legible in `timeline.ts`.

**Fix:** Add JSDoc on the export or inline-document at the barrel.

### MINOR-024 — `ChartTypeTransform.appendBar?` is optional but `reset?` is also optional; combinatorial surface unclear

**File:** `packages/core/src/chartTypes/types.ts:96-99`
4 possible support matrices (both optional → 4 combos). Documentation says incremental transforms supporting `appendBar` MUST round-trip with `transform`. But "transforms without `appendBar` always have `reset?`" — unclear contract.

**Fix:** Two interfaces: `BatchChartTypeTransform` (no append) and `IncrementalChartTypeTransform extends BatchChartTypeTransform` (has appendBar + reset required).

### MINOR-025 — `MarketSnapshot` is generic across all alert predicates but each predicate only reads 1–2 fields

**File:** `packages/core/src/alerts/types.ts:37-67`
The bag-of-everything pattern: 6 top-level fields, only one is ever read by a given predicate. Callers populating `MarketSnapshot` have to fill every field they MIGHT need — vs. lazy field population.

**Fix:** Document explicitly that fields can be omitted (BLOCKER-008 standardisation should already cover this). Consider exposing a `createMarketSnapshot(overrides)` helper to make partial population ergonomic.

### MINOR-026 — `AlertControllerOptions.maxEvents` defaults to 100 but it's not documented at the type

**File:** `packages/core/src/alerts/types.ts:174-177`
```ts
export interface AlertControllerOptions {
  /** Maximum size of the `events` ring buffer. Default 100. */
  maxEvents?: number
}
```
Default IS in the JSDoc — good. But the default constant lives in `createAlertController.ts:39` (`const DEFAULT_MAX_EVENTS = 100`). If they ever drift, the docs lie. Use a shared constant or export `ALERT_DEFAULTS`.

### MINOR-027 — `createReplayController({ start?, end?, pacing?, speed?, barIntervalMs? })` — defaults are documented inconsistently

**File:** `packages/core/src/replay/types.ts:45-53`
JSDoc says `barIntervalMs` defaults to `60_000`. Doesn't say `start` defaults to `0`, `end` defaults to `0`, etc. Inconsistent JSDoc.

**Fix:** Document every default at the field level.

### MINOR-028 — `ChartViewport.visibleFrom` and `visibleTo` are currently always 0 (TODO in impl)

**File:** `packages/core/src/controllers/createChartController.ts:286-291, 334-336`
The impl literally hardcodes `visibleFrom: 0, visibleTo: 0`. The type promises real values. Shipping this in v1 is a contract violation.

**Fix:** Either remove the fields from `ChartViewport` for v1 and add them in v1.1 (additive — non-breaking) OR implement them before publish.

### MINOR-029 — `KLineChartProps` (React) accepts `theme` but the type is `'light' | 'dark'` — no system

**File:** `packages/react/src/index.ts:215-221`
No `'system'` / `'auto'`. Modern apps want OS-driven theme.

**Fix:** `'light' | 'dark' | 'system'`.

---

## Top 10 API changes to ship before npm publish

1. **Replace `export *` in `packages/core/src/index.ts` with an explicit allow-list.** Move internal compute helpers to a `/internal` subpath. (BLOCKER-002)
2. **Canonicalise the bar type.** Introduce `Bar` at `packages/core/src/types/bar.ts`. Alias `KLineData`, `OHLCV`, `BaseBar`, `AVWAPBar`, `VolumeProfileBar`. (BLOCKER-006, BLOCKER-007)
3. **Standardise intake verbs.** Two functions only: `setData(input)` (replace whole), `append(input)` (incremental). Deprecate `ingest*`, `setBars`, `setBaseBars`, `ingestTrade`, `ingestDelta`. (BLOCKER-001, BLOCKER-010)
4. **Standardise mutator return values.** `add* → { id }` or `string`. `update*/remove* → boolean`. Eliminate `string | null` and `void` add-returns. (BLOCKER-003)
5. **Unify dispose semantics to silent no-op.** Fix `PriceScale.guard()` and `TimeScale.guard()` to early-return instead of throwing. (BLOCKER-004)
6. **Introduce `KLineChartError` taxonomy with codes.** Migrate all 53 `throw new Error(...)` sites. Roll `ChartSerializationError` and `AlertRuleSchemaError` under it. (BLOCKER-005)
7. **Standardise factory args.** All factories take a single `init: XInit = {}` (named `init`). Remove positional primitives. (MAJOR-001, MAJOR-002)
8. **Add `dataSource?: AsyncIterable<Bar>` to `ChartMountOptions`** — even as a stub — so the v1 contract is stream-ready. (MAJOR-012)
9. **Make every reactive snapshot use `T | null` and every input bag use `?: T`.** Standardise `MarketSnapshot` to use `null`. (BLOCKER-008)
10. **Add `dispose?(): void` to `ChartTypeTransform`** and fix the bridge-callback leak in `createChartController` (`packages/core/src/controllers/createChartController.ts:322-341` — wrap in `if (disposed) return`). (MAJOR-016, MAJOR-020)

---

## Surpassing TV

The data model that the controllers expose IS our edge — every state is observable via signals; TradingView hides everything behind closures.
- **`replay.state: Signal<ReplayState>`** is genuinely better than TV (TV hides the playhead state in its own JS bag — you can't read it from a userscript).
- **Multi-anchor `anchoredVwap`** with O(1) `appendBar` (`createAnchoredVwapController.ts:173-235`) beats TV's hard cap on simultaneous AVWAPs at lower tiers.
- **`alerts` engine is data-only and serializable** (`packages/core/src/alerts/ruleSchema.ts`) — TV alerts are closed, server-side, capped.
- **AI runtime** (`packages/ai-runtime`) — exposes the controllers as MCP tools without a server. TV has nothing like this.
- **Footprint with explicit `inferred: true` flag** (`packages/core/src/components/footprint/types.ts:54-58`) — honest about classifier confidence; TV is opaque.
- **Order book `replay()` reconstruction from delta archive** (`createHeatmapController.ts:149-189`) — TV doesn't expose L2 at all.

## Losing to TV

These are blocking concerns that, if a real customer evaluated this v1.0 today, would push them back to TV's library:

- **`ChartViewport.visibleFrom/visibleTo` are hardcoded to 0.** The fundamental "what bars are on screen" answer is broken. (MINOR-028)
- **No streaming `dataSource` on mount.** TV's library supports `subscribeBars` callback. We force preload. (MAJOR-012)
- **`KLineData` shape leaks Chinese-stock domain fields.** Every other charting library has a clean canonical bar. (BLOCKER-006)
- **No error code taxonomy.** TV docs every error code. Stripe-grade error contract is now table stakes. (BLOCKER-005)
- **`drawing` controller is a stub** — `clearAll` / `deleteLast` are local counters, not wired to the engine (`packages/core/src/controllers/createChartController.ts:312-317` `TODO(Round 1F)`). TV's drawing engine is the entire selling point of the library. Shipping a stub is worse than no controller.
- **`toolbar` controller defaults to an empty tools list** (`createChartController.ts:310`). The toolbar UI works in `LeftToolbar.vue` legacy code but the public controller surface doesn't expose it. New users importing `@klinechart-quant/react` will get an empty toolbar component.
- **Adapter packages don't re-export advanced controller types.** A React user importing `useFootprint` gets the hook but no easy way to type the controller. (MAJOR-017)
- **`ChartController.setTheme` does nothing** (`packages/core/src/controllers/createChartController.ts:448-453` — TODO). The type promises a working theme; the impl is empty. TV's `applyOverrides` works.

**Ship the BLOCKER fixes first; without them the API surface is below the table stakes that Stripe/TanStack/Effect set for current OSS libraries in 2026.**
