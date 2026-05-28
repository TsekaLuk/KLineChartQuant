# DX Audit — @klinechart-quant

Date: 2026-05-29
Auditor: Third-party DX reviewer (read-only audit on branch `pr13/volume-profile`; brief states branch `feat/renderer-interface`)
Scope: `packages/{core,react,vue,angular}`, `examples/`, `docs/`, repo root README

## Verdict

We surpass TradingView on framework neutrality (3 first-class adapters with idiomatic primitives — useSyncExternalStore / shallowRef / Angular signal — vs TV's single iframe `widget()`), and on differentiated quant primitives that TV does NOT expose to its SDK at all (footprint, L2 heatmap, anchored VWAP multi-anchor, MTF compute, alert predicate engine). We LOSE catastrophically on out-of-the-box install-and-render: the 4 published packages cannot be built (`pnpm build` references a `tsconfig.build.json` that does not exist), every package is `0.0.0` and unpublished, there are ZERO READMEs in `packages/*`, the root README still markets the legacy `@363045841yyt/klinechart` single-package usage with no mention of the new scoped packages, and `createChart()` throws an opaque error with no factory or no container instead of rendering a chart. **NOT READY FOR PUBLIC LAUNCH.** A developer arriving from a hypothetical "npm install @klinechart-quant/react" tweet will be back on TradingView in under five minutes.

## Findings

### BLOCKER-001 — Packages literally cannot be built
**File:** `packages/core/package.json:34`, `packages/react/package.json:26`, `packages/vue/package.json:26`, `packages/angular/package.json:26`
**Issue:** Every adapter's `build` script is `"tsc -p tsconfig.build.json"`, but no `tsconfig.build.json` exists in any `packages/*`. Only `tsconfig.json` is present. `pnpm -r build` will exit non-zero on the first package.
**Repro:** `find packages -name tsconfig.build.json` returns nothing; `find packages -name dist -type d` returns nothing. The published `exports."."` in every package.json points at `./dist/index.js` which has never been produced.
**Industry comparison:** Stripe, Vercel AI SDK, shadcn, TanStack — `npm pack` after clone produces a valid tarball. Ours produces nothing.
**Fix:** Add `tsconfig.build.json` per package (extends `tsconfig.json`, omits `__tests__`), or switch scripts to `tsc -p tsconfig.json`. Add a pre-publish CI gate that runs `npm pack --dry-run` and asserts `dist/index.js` exists.

### BLOCKER-002 — Adapter peerDependency points at a workspace protocol that npm cannot resolve
**File:** `packages/react/package.json:43`, `packages/vue/package.json:43`, `packages/angular/package.json:45`
**Issue:** Each adapter declares `"@klinechart-quant/core": "workspace:*"` as a `peerDependencies` entry. `workspace:*` is a pnpm-only protocol. When the package is published, the protocol is supposed to be rewritten to the actual version, but (a) the version is `0.0.0` (BLOCKER-006), and (b) the published manifest will still carry `workspace:*` unless `pnpm publish` is used with the correct config. A user doing `npm install @klinechart-quant/react` against an unconfigured publish would see `npm ERR! Unsupported URL Type "workspace:": workspace:*`.
**Repro:** Inspect any adapter package.json line for peerDeps `@klinechart-quant/core`.
**Industry comparison:** Stripe's `@stripe/react-stripe-js` ships a peerDep on `@stripe/stripe-js` with a real semver range (`^7.0.0`), not a workspace protocol.
**Fix:** Move `@klinechart-quant/core` from `peerDependencies` to `dependencies` with a real range like `"workspace:^"` (rewritten on publish) or pin to exact version. Verify by running `npm pack` then inspecting the resulting tarball's package.json.

### BLOCKER-003 — Every package is version 0.0.0; nothing has ever been published
**File:** `packages/{core,react,vue,angular}/package.json:3`
**Issue:** All four packages are at `"version": "0.0.0"`. Combined with BLOCKER-001 and BLOCKER-002, no one outside this repo has ever installed these.
**Industry comparison:** Vercel AI SDK ships nightly versions even pre-1.0. Visible momentum is part of DX.
**Fix:** Cut a `0.1.0-alpha.0` after closing the other blockers, publish to npm via the existing `publishConfig.provenance` setting, and put the install command in the root README.

### BLOCKER-004 — Zero READMEs in `packages/*`
**File:** Looked for `packages/*/README.md`; none exist.
**Issue:** When a user lands on `npmjs.com/package/@klinechart-quant/react`, the README pane will be empty. npm shows the README from the package's `files`-included root README. Since none of the four packages have one, the published page is blank.
**Repro:** `find packages -name README.md` returns 0.
**Industry comparison:** Stripe, TanStack, shadcn — every published package has at least a 100-line README with installation, quickstart, link to docs. TradingView's Charting Library README is multi-page with copy-pasteable HTML.
**Fix:** Ship a per-package README that contains: install command, the literal minimum code to render a chart, link to `docs/`, link to examples, peerDep matrix.

### BLOCKER-005 — Root README still markets the legacy v0.7 single-package
**File:** `README.md:69-99`
**Issue:** The repo's main README shows `npm install @363045841yyt/klinechart` and `import KLineChart from '@363045841yyt/klinechart'`. There is ZERO mention of `@klinechart-quant/{core,react,vue,angular}`. A user finding this repo via search will install the legacy package, not the new scoped one. `grep '@klinechart-quant' README.md README_CN.md` returns nothing.
**Industry comparison:** When Stripe migrated `stripe-js` to `@stripe/stripe-js`, the root README was the first thing rewritten with a deprecation banner pointing at the new scope. TanStack rebrands its root README at every major.
**Fix:** Add a `## Packages` section at the top of `README.md` enumerating the four scoped packages with one-line install snippets, and add a deprecation banner pointing legacy `@363045841yyt/klinechart` users at the migration guide (which does not yet exist — see MAJOR-010).

### BLOCKER-006 — `createChart()` throws synchronously on the happiest happy path
**File:** `packages/core/src/controllers/createChartController.ts:47-54`, `packages/angular/src/index.ts:128-141`
**Issue:** The Angular adapter's `createChart` requires `opts.factory` and throws `"createChart: no ChartControllerFactory provided"` if you don't pass one. Even though `KLINE_CHART_FACTORY` provides a default (`createChartController`), the imperative helper rejects the call. The error message tells the user to do something (`pass factory in opts or register via provideKLineChart`) that a typical user did not know existed because there's no README or quickstart.
**Repro:** `import { createChart } from '@klinechart-quant/angular'; createChart({ container, data: [] })` → `Error: createChart: no ChartControllerFactory provided.`
**Industry comparison:** TradingView's `new TradingView.widget({ container_id, symbol })` works on the first call. Stripe `loadStripe('pk_...')` works on the first call.
**Fix:** Default `opts.factory` to `createChartController` from `@klinechart-quant/core` so the imperative helper requires only `{ container, data }`.

### BLOCKER-007 — React adapter throws if mount runs before the factory auto-register effect ordering, in any environment that imports `useChart` from a deeply lazy path
**File:** `packages/react/src/index.ts:55-62`, `packages/react/src/index.ts:253-254`
**Issue:** The factory is auto-registered at the very bottom of the module (`__setChartFactory(createChartController)`) but `useChart` references `resolveFactory()` at the top of the file. ES module evaluation order makes this fine in the simple case, but the comment at line 9 still says "Production builds will register the real factory from `@klinechart-quant/core/controllers/createChartController` (Phase 1 deliverable)" — i.e. the documented contract still claims registration is the consumer's responsibility. A user reading the source will doubt the auto-register works and adopt the legacy package instead.
**Industry comparison:** Stripe's `loadStripe` returns a promise that resolves once `Stripe.js` is loaded — never throws "factory not registered". The contract is self-healing.
**Fix:** Delete the `Phase 1 deliverable` line at index.ts:9, delete the entire `__setChartFactory` export from the public surface (move to `__setChartFactoryForTesting`), and stop documenting the pre-auto-register escape hatch as if it were a contract.

### BLOCKER-008 — TypeScript types claim `@klinechart-quant/core/reactivity` and `/controllers` subpath exports but the build will not produce them
**File:** `packages/core/package.json:11-24`
**Issue:** `exports."./reactivity"` and `exports."./controllers"` both point at `./dist/reactivity/index.d.ts` and `./dist/controllers/index.d.ts`. Without a `tsconfig.build.json` (BLOCKER-001) those paths are vapor. Worse, the Vue adapter imports from `@klinechart-quant/core/reactivity` (`packages/vue/src/index.ts:26`), so even a working tsc build will fail when the Vue adapter resolves the subpath at install time.
**Industry comparison:** TanStack's per-feature subpath exports are guaranteed by their tsup config and verified in CI by `publint --strict`.
**Fix:** Run `publint --strict` (already in `lint:publish`) against an actual tarball in CI; gate publish on it succeeding.

### BLOCKER-009 — Adapter packages cross the `rootDir` boundary into the legacy `src/`
**File:** `packages/core/src/controllers/createChartController.ts:47-54`
**Issue:** `createChartController.ts` does `import { Chart } from '../../../../src/core/chart'` (four levels up, into the legacy v0.7 tree). The package's `tsconfig.json:17` sets `rootDir: "src"`. tsc will refuse to compile this with `error TS6059: File 'src/core/chart.ts' is not under 'rootDir'`. The comment at lines 30-33 even admits this is "accepted by tsc with `moduleResolution: bundler`" — which is half true; tsc with `--declaration` will not emit dts files referencing a file outside rootDir. The published `dist/` will be broken or missing.
**Industry comparison:** TanStack packages keep all source inside the package; nothing crosses into a monorepo neighbour at compile time.
**Fix:** Either (a) move the legacy `Chart` class into `packages/core/src/engine/` so it's inside rootDir, or (b) build the adapter with tsup/rollup which can bundle across boundaries, then strip the rootDir constraint.

### MAJOR-001 — `useChart` is a 2-step ceremony where `<KLineChart>` should be a 1-liner — but `<KLineChart>` does not auto-mount data correctly
**File:** `packages/react/src/index.ts:230-240`, `packages/vue/src/index.ts:219-309`, `packages/angular/src/index.ts:147-225`
**Issue:** The convenience `<KLineChart>` component exists in all three adapters, but the typical first-import experience is to write the `useChart` hook with a ref. The component versions take `data` as a prop but don't expose toolbar/drawing/indicator state to children. So the user ends up writing the 12-line useChart ceremony anyway. Net lines for "hello world chart" in React:
```tsx
const ref = useRef<HTMLDivElement>(null)
useChart(ref, { data })
return <div ref={ref} style={{height: 400}} />
```
4 lines minimum. TradingView's equivalent is `new TradingView.widget({ container_id: 'c', symbol: 'AAPL' })` — 1 line.
**Industry comparison:** shadcn `<Button>`, TanStack `<QueryClientProvider>` — both zero-ceremony, no ref dance.
**Fix:** Make `<KLineChart>` the documented entry point in every README. Add `defaultStyle={{height: 400}}` so users don't need to set it. Forward a `ref` for controller access.

### MAJOR-002 — No debug mode, no `chart.diagnose()`, no verbose logging flag — silent failure is the default
**File:** Searched `packages/core` for `debug`, `diagnose`, `verbose`, `log` — only matches are comments saying "no console.* per coding-style.md" (`packages/core/src/alerts/createAlertController.ts:25`).
**Issue:** When a developer mounts the chart and sees nothing, the only feedback is the absence of pixels. There is no `createChart({ container, data, debug: true })` option, no `chart.diagnose()` that returns `{ canvasSize, dataPoints, visibleRange, lastError }`, no per-frame trace flag. The `applyRenderState` calls inside `createChartController` are wrapped in `try { } catch { /* tolerate jsdom canvas absence */ }` — silently swallowed (lines 280-283, 379-382, 411-414). If jsdom is what's blocking, the user has no way to know.
**Industry comparison:** TradingView's widget has `debug: true` that dumps engine state to console and overlays a stats box. Stripe `loadStripe(key, { betas: ['...'] })` accepts a logger. Vercel AI SDK has `experimental_telemetry`.
**Fix:** Add `ChartMountOptions.debug?: boolean | { level: 'info'|'warn'|'error' }`. Wire it through `createChartController` so every swallowed try/catch logs the error. Add `controller.diagnose()` returning a serialisable object.

### MAJOR-003 — Tree-shaking is defeated by `export *` barrels across 13 sub-modules
**File:** `packages/core/src/index.ts:1-13`
**Issue:** The core entrypoint does `export * from './reactivity'`, `export * from './controllers'`, etc. for 13 sub-modules. Even with `"sideEffects": false` set, a user importing only `createVolumeProfileController` from the root will pull in the type-resolution graph for every other module. The `exports` map at `package.json:11-24` provides `./reactivity` and `./controllers` subpath exports, but does NOT provide subpath exports for `./alerts`, `./components/footprint`, `./components/volumeProfile`, `./components/orderBookHeatmap`, `./components/anchoredVwap`, `./components/mtfOverlay`, `./chartTypes`, `./scene`, `./render`, `./replay`, `./scale`. A user who wants just the alert engine has no way to import it without dragging in the whole core.
**Industry comparison:** TanStack `import { useQuery } from '@tanstack/react-query'` — single subpath, every other feature is its own subpath if it has DOM cost. shadcn explicitly tells you to copy individual files. TradingView's library does NOT have this advantage — we lose it anyway by dumping everything into a barrel.
**Fix:** Add per-component subpath exports to `packages/core/package.json#exports`: `./alerts`, `./components/volumeProfile`, `./components/orderBookHeatmap`, `./components/footprint`, `./components/anchoredVwap`, `./components/mtfOverlay`, `./chartTypes`, `./scene`, `./render`, `./replay`, `./scale`. Make the root barrel a thin re-export only for the typical install.

### MAJOR-004 — `ChartMountOptions.data` is a non-discriminated array; no parse error if shape is wrong
**File:** `packages/core/src/controllers/types.ts:18-31, 163-169`
**Issue:** `KLineData` is a plain interface; `setData` takes `ReadonlyArray<KLineData>`. There's no runtime validation. Pass `[{open: 'oops'}]` and TypeScript catches it at compile time only — at runtime the engine will NaN the price scale and you get a blank chart with no error (compounded by MAJOR-002). The CLAUDE.md style guide mandates Zod for input validation; this is not applied.
**Industry comparison:** Stripe parses every input with a schema and throws a typed error (`StripeInvalidRequestError`). Vercel AI SDK uses Zod for tool-call validation. TradingView's UDF datafeed expects exact shapes and rejects the rest.
**Fix:** Ship `KLineDataSchema` (Zod) and have `createChartController` parse `opts.data` with it. Throw with `data[i] is missing 'close'`, not silent NaN.

### MAJOR-005 — Error messages tell the user about implementation bugs, not about how to fix them
**File:** see ratings below
**Issue:** First 20 errors rated 1-5 (5 = actionable; 1 = useless):

| Rating | File:line | Message | Why |
|---|---|---|---|
| 4 | `packages/core/src/scale/createPriceScale.ts:71` | `createPriceScale: initialHeight must be > 0, got ${initialHeight}` | Tells the value, decent |
| 4 | `packages/core/src/scale/createTimeScale.ts:36` | `createTimeScale: initialBarWidth must be > 0, got ${initialBarWidth}` | Same pattern |
| 2 | `packages/core/src/scale/createTimeScale.ts:48` | `TimeScale: instance has been disposed` | Doesn't say WHAT called it post-dispose or HOW to keep it alive |
| 2 | `packages/core/src/scale/createPriceScale.ts:89` | `PriceScale: instance has been disposed` | Same |
| 5 | `packages/core/src/scale/createPriceScale.ts:62` | `createPriceScale: initialVisibleMax (${max}) must be >= initialVisibleMin (${min})` | Names both values |
| 4 | `packages/core/src/scale/createPriceScale.ts:67` | `createPriceScale: log mode requires visibleMin > 0, got ${initialVisibleMin}` | Explains why |
| **1** | `packages/core/src/render/__tests__/contract.test.ts:105` | `compute not supported on this backend` | Doesn't say which backend, what does support it, or how to feature-detect |
| **1** | `packages/core/src/components/orderBookHeatmap/createHeatmapController.ts:253` | `HeatmapController: tickSize must be > 0` | No example value, no link to docs |
| **1** | `packages/core/src/components/orderBookHeatmap/createHeatmapController.ts:255` | `HeatmapController: snapshotIntervalMs must be > 0` | Same |
| 2 | `packages/core/src/components/orderBookHeatmap/createHeatmapController.ts:261` | `HeatmapController: deltaArchiveMaxSize must be ≥ 0` | Could say "use Number.POSITIVE_INFINITY for unbounded" |
| **1** | `packages/core/src/components/footprint/createFootprintController.ts:64` | `FootprintController: tickSize must be > 0` | No example, no link |
| 3 | `packages/core/src/components/mtfOverlay/createMtfController.ts:82-86` | `MtfController: targetIntervalMs (${targetMs}) must be an integer multiple of baseIntervalMs (${baseIntervalMs})` | Math-explicit, decent |
| **1** | `packages/core/src/components/mtfOverlay/resampleBars.ts:37` | `resampleBars: baseIntervalMs must be a positive finite number` | Repeats the type signature in English |
| 2 | `packages/core/src/replay/createReplayController.ts:60` | `Replay range must be finite numbers: got start=..., end=...` | OK but doesn't say what to pass instead |
| 3 | `packages/core/src/replay/createReplayController.ts:75` | `Replay speed must be a positive finite number; got ${String(speed)}` | OK |
| **1** | `packages/core/src/chartTypes/renko.ts:287` | `createRenko: config requires brickSize > 0 or useATR { period }` | Cryptic; doesn't give a sample config |
| **1** | `packages/core/src/scene/layerRegistry.ts:70-72` | `LayerRegistry: typeId "..." is already registered` | Doesn't say where the first registration happened |
| **1** | `packages/react/src/index.ts:55-60` | `[@klinechart-quant/react] No ChartControllerFactory registered. Call __setChartFactory(factory) before mounting...` | Tells the user to call an internal `__`-prefixed API |
| 2 | `packages/angular/src/index.ts:135-138` | `createChart: no ChartControllerFactory provided. Pass factory in opts or register one via provideKLineChart({ factory }).` | Mentions the supported API but no example |
| **1** | `packages/vue/src/index.ts:78-82` | `[@klinechart-quant/vue] createChart: no ChartController factory registered.` | Same problem as React |

**Worst 5:** (`packages/react/src/index.ts:55`), (`packages/vue/src/index.ts:78`), (`packages/core/src/scene/layerRegistry.ts:70`), (`packages/core/src/components/orderBookHeatmap/createHeatmapController.ts:253`), (`packages/core/src/chartTypes/renko.ts:287`).
**Industry comparison:** Stripe errors say `IntegrationError: You passed an empty string for 'card[number]'. We recommend running this code in a try/catch block. See https://stripe.com/docs/error-codes/parameter-missing for more info.` Every error has a link.
**Fix:** Add `docs/audit/ERRORS.md` enumerating each thrown error with: when it fires, what to do, sample code.

### MAJOR-006 — `<KLineChart>` React component renders a div with no explicit dimensions; mounts into a 0×0 box
**File:** `packages/react/src/index.ts:230-240`
**Issue:** The `style` prop is optional; if the user passes `<KLineChart data={data} />` with no style override, the host `<div>` defaults to `height: auto` (i.e. 0). The chart mounts, the engine asks the container its size, gets `0×0`, and renders nothing. The user sees a blank page with no error.
**Industry comparison:** TradingView's widget defaults to 400×600. Recharts requires `<ResponsiveContainer>` but the error tells you so.
**Fix:** Default `style={{ width: '100%', height: 400 }}` and document override. Or throw a friendly error if `getBoundingClientRect()` reports 0 area on mount.

### MAJOR-007 — Examples are SSR smoke tests, not getting-started demos
**File:** `examples/README.md:1-7`
**Issue:** Verbatim from the README: "These are **not feature demos**. They exist to verify that each adapter package is SSR-safe". A developer cloning the repo and running `pnpm dev` in `examples/next-app` will see "Chart mounts here on the client. SSR build only renders this shell." No candlesticks. No indicators. No interaction. Worse, `examples/next-app/app/chart.tsx:24-30` admits: "NOTE: `data` here is plain mock — the engine factory is not wired in this smoke test, so the hook will throw at mount time IF a consumer actually runs `pnpm dev` without registering a factory." The README of the example is honest, but the SDK has no real demo.
**Industry comparison:** TradingView ships a 100-line index.html that renders a working chart on `python -m http.server`. Stripe's React example renders a working checkout in 30 seconds. Vercel AI SDK's `examples/next-openai` is a real chatbot.
**Fix:** Add `examples/quickstart/` as a runnable Next.js app that registers the production factory and renders real OHLC data within 60 seconds of `pnpm install && pnpm dev`.

### MAJOR-008 — No `docs/getting-started.md`, no `docs/api/`, no migration guide
**File:** Searched `docs/` recursively for `MIGRATION*`, `GETTING_STARTED*`, `getting-started*` — none.
**Issue:** `docs/` contains 18 deep technical files (ROADMAP, COMPETITIVE_ANALYSIS, rendering-engine-architecture etc.) totaling >500KB. None of them are a "you have 5 minutes, here's a chart" doc. There's literally no entry point for a developer who has not read the entire codebase. `docs/api.md` is 7 bytes.
**Industry comparison:** TanStack's docs has `docs/installation`, `docs/quick-start`, `docs/guides/*`, `docs/api/*`. shadcn has a `quick-start` page with a copy-paste hero. TradingView Charting Library docs have `Getting Started`, `Tutorial`, `Connecting Data`, `Widget Constructor`.
**Fix:** Add `docs/getting-started.md` with the 30-line minimum chart. Add `docs/api/` autogenerated from JSDoc with TypeDoc.

### MAJOR-009 — Legacy `KMapPlugin.install` claims back-compat but `app.component('KLineChart', KLineChart)` registers the NEW component, not the legacy `.vue` SFC
**File:** `packages/vue/src/index.ts:319-323`, `src/components/KLineChart.vue` (legacy SFC)
**Issue:** The compat shim does `app.component('KLineChart', KLineChart)` where `KLineChart` is the new `defineComponent` from this file (lines 219-309). Its props are `data`, `initialZoomLevel`, `zoomLevels`, `theme`, `containerClass`. The LEGACY SFC's prop is `semanticConfig: SemanticChartConfig` (root README:111-119). A user upgrading from `@363045841yyt/klinechart` who does `<KLineChart :semanticConfig="..." />` will get either a Vue prop validation warning or, worse, silently broken behaviour because `semanticConfig` is not recognised by the new component.
**Industry comparison:** When Vue 2 → 3 migration broke prop shapes, the official migration guide was upfront. Vercel SDK 3 → 4 ships a codemod.
**Fix:** Either (a) make the new `<KLineChart>` accept BOTH `data` AND `semanticConfig`, or (b) rename the new component (`KLineChartV1`) and keep the legacy SFC available under the original prop contract via the plugin. Document explicitly which one `KMapPlugin.install` registers.

### MAJOR-010 — No migration guide from `@363045841yyt/klinechart` v0.7
**File:** Looked for `MIGRATION.md`, `docs/migration*`, `MIGRATING.md` — none.
**Issue:** The repo currently publishes `@363045841yyt/klinechart` at v0.7.0 (`package.json:2-3`). Existing users have shipped products against it. There is no document anywhere that says: "if you were on v0.7 with `import KLineChart from '@363045841yyt/klinechart'`, here is how you move to `@klinechart-quant/vue`." The roadmap mentions migration in passing but doesn't ship a one-pager.
**Industry comparison:** Stripe ships SDK-version migration guides for every major bump. Vercel AI SDK has a migration guide at `/docs/migration-guides/migration-guide-4-0`.
**Fix:** Write `docs/MIGRATION.md` covering: package rename, props rename, removed `semanticConfig`, behavioural deltas, codemod if any.

### MAJOR-011 — IndicatorSelectorController exposes 10+ Chinese-only `name` strings as part of the public API
**File:** `packages/core/src/controllers/createChartController.ts:78-118`
**Issue:** The default indicator catalog hard-codes `name: '移动平均线'`, `name: '布林带'`, `name: '指数平均线'`, etc. for every indicator. This is fine for a Chinese-market product but it surfaces in `controller.indicatorSelector.catalog()` as the user-facing name. An English-only user clicking the indicator picker sees Chinese strings they can't read, and there's no i18n hook.
**Industry comparison:** TradingView ships all UI strings via `i18n.json` with 20+ locales. Stripe SDK error messages are English with locale-aware error codes.
**Fix:** Add `IndicatorDefinition.nameI18n: Record<string, string>` and have `createChartController` accept `opts.locale: 'en' | 'zh'` to pick the default label.

### MAJOR-012 — `ChartController.viewport` publishes `visibleFrom: 0, visibleTo: 0` always (admitted in source)
**File:** `packages/core/src/controllers/createChartController.ts:321-337, 381-386, 414-420`
**Issue:** The viewport signal is wired so visibleFrom/To are ALWAYS 0. Line 332-333 comment: "Visible range is opaque to the controller without re-deriving from scrollLeft/kWidth; we publish what we know and leave visibleFrom/To as 0 until a dedicated visible-range signal is added." A consumer subscribing to `controller.viewport()` to know "which candle is at the left edge" will read `{visibleFrom: 0, visibleTo: 0}` forever. Documented-as-broken is still broken.
**Industry comparison:** TradingView's `chart.onVisibleRangeChanged()` actually returns the range. Lightweight Charts does too.
**Fix:** Compute visibleFrom/To from `chart.getCachedScrollLeft()` and `kWidth` and publish on every viewport change. Until done, type the field as `0` literal or remove it from the surface.

### MAJOR-013 — Toolbar and Drawing controllers are stubbed; the public type promises features that don't work
**File:** `packages/core/src/controllers/createChartController.ts:306-318`
**Issue:** Comments at lines 306-318: "TODO(Round 1F): cross-wire toolbar selections to drawing.setActiveTool" and "TODO(Round 1F): bind drawing.clearAll / deleteLast to the legacy DrawingStore". The `ChartController` surface advertises `controller.toolbar` and `controller.drawing` as functional. A user wiring `controller.toolbar.selectTool('trendline')` expects to start drawing a trendline. Nothing happens because the cross-wire is a TODO.
**Industry comparison:** Stripe's `Elements` either ship complete or are gated behind `beta` flags so users know.
**Fix:** Either complete the wiring before publishing, or mark `controller.toolbar` and `controller.drawing` as `experimental` and gate access on `createChart({ experimental: true })`.

### MAJOR-014 — `<KLineChart>` Vue component re-emits `zoomLevelChange` event but the legacy SFC was called via `@zoom-change` (kebab case prop)
**File:** `packages/vue/src/index.ts:235-265`
**Issue:** The new component emits `zoomLevelChange` (camelCase) and `ready`. Vue 3 forwards these as `@zoom-level-change` (kebab) in templates, which works, but a legacy consumer who was listening for whatever the old event name was will find no event fires. There's no event-name compat layer.
**Industry comparison:** Vercel SDK keeps deprecated function names with `@deprecated` JSDoc for at least one minor.
**Fix:** Document every emitted event with its kebab-case template form in the component JSDoc.

### MAJOR-015 — `dispose()` silently swallows engine errors
**File:** `packages/core/src/controllers/createChartController.ts:471-501`
**Issue:** `dispose` wraps every internal `dispose`/`destroy` call in `try { } catch { /* best-effort */ }`. If `chart.destroy()` threw because the user disposed twice, or because a renderer leaked, the consumer sees nothing. This silently masks bugs in dev. The CLAUDE.md style guide says "Never silently swallow errors".
**Industry comparison:** Stripe SDK throws if you double-call `paymentIntent.confirm()`.
**Fix:** Log to `debug` channel (see MAJOR-002) instead of swallowing. In dev mode, re-throw.

### MAJOR-016 — Adapter peerDeps allow React 18 but adapter dev-dep uses React 19; SSR contract not tested against 18
**File:** `packages/react/package.json:42-55`
**Issue:** `peerDependencies.react: "^18.0.0 || ^19.0.0"`, but `devDependencies.react: "^19.0.0"` and tests run only against 19. The README example imports `'use client'` and `next: '^15.0.0'` (`examples/next-app/package.json:14`) — Next 15 ships React 19. The React 18 codepath is unverified. `useSyncExternalStore` behaviour differs subtly between 18 and 19 around `getServerSnapshot`.
**Industry comparison:** TanStack runs CI against every supported React major. shadcn pins peerDeps to the actually-tested range.
**Fix:** Add a CI job that installs React 18 in the react adapter and runs the contract tests.

### MAJOR-017 — Angular peerDep allows `^17 || ^18 || ^19` but `experimentalDecorators` is the new default; no test against 17
**File:** `packages/angular/package.json:43-46`, `packages/angular/tsconfig.json:7`
**Issue:** Same shape as MAJOR-016. The adapter advertises Angular 17 support but ships with no compatibility shim for the pre-signal `OnPush` change-detection path. Test matrix is single-version.
**Fix:** Drop Angular 17 from peerDep, OR add a matrix test.

### MAJOR-018 — `AlertController.evaluate(snapshot, now)` exposes `now` as a manual parameter
**File:** `packages/core/src/alerts/types.ts:163-165`
**Issue:** Forces callers to thread `Date.now()` (or `performance.now()`) into every call. This is deterministic-test friendly but ergonomically hostile. A user wiring this to a stream loses 5 minutes wondering "why am I passing now() every call?" then wraps it in their own helper. The wrapper would be the public API in a polished SDK.
**Industry comparison:** Stripe doesn't ask the user for `now`. Vercel SDK doesn't.
**Fix:** Make `now` optional and default to `Date.now()`. Keep the explicit pass for tests.

### MAJOR-019 — `KMapPlugin` is the only legacy export preserved, but legacy was much more than a Vue plugin
**File:** `packages/vue/src/index.ts:319-323`
**Issue:** The legacy package exports `KLineChart` (default), `SemanticChartConfig` type, and a bunch of style imports (`./style.css`). The new Vue adapter exports only `KMapPlugin` for compat. The user who did `import KLineChart from '@363045841yyt/klinechart'` cannot do `import KLineChart from '@klinechart-quant/vue'` because the default export is missing (`KLineChart` is a named export and accepts different props).
**Fix:** Either ship a `@klinechart-quant/legacy-compat` shim that re-exports the legacy surface, or write the migration guide (MAJOR-010) that walks through each removal.

### MAJOR-020 — `examples/*` deliberately excluded from `pnpm-workspace.yaml`; user has to install per-example
**File:** `pnpm-workspace.yaml:1-2`, `examples/README.md:25-42`
**Issue:** Each example needs its own `pnpm install` because they're not in the workspace. The README admits this is deliberate to avoid CI install times, but the trade-off is that a developer cloning the repo and running `pnpm install` at root has nothing runnable. They have to read `examples/README.md` to discover the workflow.
**Industry comparison:** Vercel AI SDK monorepo includes examples in the root workspace; `pnpm install && pnpm --filter ai-chatbot dev` works in one go.
**Fix:** Either include `examples/*` in the workspace with on-demand build/install, or add a `pnpm dev:example next` script at root that cd's and installs.

### MINOR-001 — Public API uses Chinese variable comments alongside English code
**File:** `packages/core/src/controllers/createChartController.ts:78-118`
**Issue:** Inline comments are English but `name` strings are Chinese. Reads as bilingual product. Either commit to bilingual or move strings to i18n files.

### MINOR-002 — `IndicatorDefinition.name` is mandatory but `label` is also mandatory — redundant
**File:** `packages/core/src/controllers/types.ts:54-63`
**Issue:** Every catalog entry repeats short and long labels. Half of the catalog has `id === label`. Either make `label` optional defaulting to `id`, or drop it.

### MINOR-003 — `ChartViewport` has `kWidth` jargon in the public type
**File:** `packages/core/src/controllers/types.ts:171-176`
**Issue:** A junior dev cold-reading the type does not know `kWidth` means "K-line width in CSS pixels". Rename to `barWidthPx` or add JSDoc.

### MINOR-004 — Signal type uses callable + properties shape that defeats VS Code "go to definition"
**File:** `packages/core/src/reactivity/signal.ts:13-22`
**Issue:** `Signal<T>` is `() => T & { peek, set, subscribe }`. VS Code "go to definition" on `signal()` jumps to a 1-line type alias, not to the implementation. Add a JSDoc `@see createSignal` link.

### MINOR-005 — `createChart()` synchronous; no async data loading helper
**File:** `packages/react/src/index.ts:75-86`
**Issue:** Real apps load OHLC data from a fetch. The SDK provides `setData` post-mount but no `createChart({ data: fetchData() })` async path. Users build their own.
**Industry comparison:** TradingView's Charting Library has a `DataFeed` interface explicitly for streaming. TanStack Query has `useSuspenseQuery`.
**Fix:** Ship a `DataFeed` type and a `useChartFromFeed(feed)` hook for React/Vue/Angular.

### MINOR-006 — `Tarmac` of TODOs in production code without GitHub issue links
**File:** `packages/core/src/controllers/createChartController.ts:306-318, 451-453`
**Issue:** Comments say `TODO(Round 1F)` and `TODO(maintainer)`. None link to a tracked issue. A new contributor doesn't know whether these are blocked, claimed, or abandoned.

### MINOR-007 — Naming inconsistency: `createChart` (in adapters) vs `createChartController` (in core)
**File:** `packages/react/src/index.ts:75`, `packages/core/src/controllers/createChartController.ts:220`
**Issue:** The user sees `createChart` in adapter docs, then `createChartController` in core docs. Same thing, two names.
**Fix:** Pick one (`createChart`) and re-export under that name in core too.

### MINOR-008 — `<KLineChart>` Vue component does not forward HTML attributes
**File:** `packages/vue/src/index.ts:300-308`
**Issue:** The render function returns `h('div', { ref, class, style })` with hardcoded `width: 100%, height: 100%`. A consumer who sets `<KLineChart class="rounded-lg" data-testid="chart">` will not see the data-testid attribute, because `inheritAttrs` is not configured. Tests can't target the root.

### MINOR-009 — Type names `AVWAPPoint`, `AVWAPBar` are jargon-y
**File:** `packages/core/src/components/anchoredVwap/types.ts:33-71`
**Issue:** Anchored VWAP is industry jargon. A junior dev who has never traded won't intuit what `lower2` means without reading the doc comment. The doc comment is good (lines 39-54), but the type name doesn't help.
**Fix:** Consider `AnchoredVwapBand.{vwap, oneSigmaUpper, oneSigmaLower, twoSigmaUpper, twoSigmaLower}` so the field names self-document.

### MINOR-010 — `MarketSnapshot.indicators` is `Record<string, number>` — opaque keys
**File:** `packages/core/src/alerts/types.ts:47-48`
**Issue:** A user writing `predicate: { kind: 'indicator-cross', indicatorId: 'rsi-14' }` has no autocomplete because `indicatorId` is `string`. The catalog declares stable ids (`packages/core/src/controllers/createChartController.ts:78-118`) but the alert engine doesn't reference that catalog.
**Fix:** Generate a literal-union type from the default catalog and accept `(IndicatorCatalogId | string)`.

### MINOR-011 — `OrderBookDelta.timestamp` is exchange wall-clock ms but no timezone disclaimer
**File:** `packages/core/src/components/orderBookHeatmap/types.ts:29-34`
**Issue:** A user pulling from Binance vs Coinbase vs an internal exchange will see different clock offsets. The type comment says "exchange wall-clock in milliseconds" but doesn't say "assumed UTC". An engineer in Asia integrating a US exchange could mis-bucket snapshots.

### MINOR-012 — `IndicatorParamDef.default` is `number | string | boolean` (no array, no object)
**File:** `packages/core/src/controllers/types.ts:43-47`
**Issue:** MA (and Bollinger, and MACD) take an array of periods (`[5, 10, 20]`). The schema forces the user to encode this as a string and parse it. The legacy `SemanticChartConfig.indicators.main: [{ type: 'MA', params: [5, 10, 20] }]` (root README:87) supported array params.
**Fix:** Widen the type or have a separate `array-of-number` kind.

### MINOR-013 — Bundle size targets only measure source, not built output
**File:** `packages/core/package.json:42-48`
**Issue:** `size-limit` is configured to measure `path: src/index.ts` with the source TS as input. This measures source size, not the built CJS/ESM output that users actually download. After tsc strips types and runs DCE, the real size may be very different. The 30KB gzip claim is aspirational at best.
**Fix:** Point `size-limit` at `dist/index.js` (once BLOCKER-001 is fixed).

### MINOR-014 — No `homepage` or `bugs` field in `packages/*/package.json`
**File:** `packages/core/package.json:2-7` (no `homepage`/`bugs`/`repository.directory`)
**Issue:** When a user lands on `npmjs.com/package/@klinechart-quant/core`, no "Homepage" or "Issues" links are shown. The root `package.json` has these but the adapter packages do not inherit.
**Fix:** Add `homepage`, `bugs`, and `repository: { type: 'git', url: '...', directory: 'packages/core' }` to every package.

### MINOR-015 — `__setChartFactory` / `__setControllerFactory` are public exports
**File:** `packages/react/src/index.ts:49`, `packages/vue/src/index.ts:56`
**Issue:** The `__`-prefix convention is internal-by-convention but TS will autocomplete them in user code. A junior dev will use them, build something against the internal contract, then break when the SDK refactors the registration.
**Fix:** Move to `@klinechart-quant/react/internal` subpath, or rename to `__internal_setChartFactory`.

## Surpassing TV (where we win)

- **Native framework primitives in three idiomatic shells.** TV ships a single iframe `widget()` wrapped by community React/Vue bindings. We ship `useChart` (React), `useChart` composable (Vue), `<kline-chart>` standalone component + DI provider (Angular). Concrete files: `packages/react/src/index.ts:106-137`, `packages/vue/src/index.ts:125-164`, `packages/angular/src/index.ts:147-225`. None of these wrap an iframe.
- **Full source TypeScript types for every controller surface.** `packages/core/src/controllers/types.ts:18-203`, `packages/core/src/alerts/types.ts:118-176`, `packages/core/src/components/anchoredVwap/types.ts`, `packages/core/src/components/footprint/types.ts`, `packages/core/src/components/orderBookHeatmap/types.ts`. TV's Charting Library types are partial and behind a license; our types are MIT and complete.
- **Anchored VWAP supports multiple simultaneous anchors.** `packages/core/src/components/anchoredVwap/types.ts:118-173`. TV restricts AVWAP anchors per chart by tier (`docs/COMPETITIVE_ANALYSIS.md`). We don't.
- **L2 order-book heatmap with delta archive + snapshot ring as first-class primitives.** `packages/core/src/components/orderBookHeatmap/types.ts:88-101, 139-157`. TV does not expose any L2 surface to the SDK.
- **Footprint with explicit aggressor confidence flag.** `packages/core/src/components/footprint/types.ts:43-57`. TV added footprint datafeed support in Jan 2026 but the SDK consumer cannot wire their own classifier; we expose `fallbackClassifier: 'tick-rule' | 'lee-ready'`.
- **Alert predicate engine in-process, no server tier required.** `packages/core/src/alerts/types.ts:81-110`. 9 predicate kinds + a `custom` escape hatch. TV alerts are server-side and tier-capped (60 free → 1000 Ultimate).
- **MTF (multi-timeframe) compute primitives.** `packages/core/src/components/mtfOverlay/createMtfController.ts:30-110`. TV requires Pine Script to compute on a higher TF; we ship the resample + align math as a controller.
- **Native chart types in `chartTypes/`: Heikin-Ashi, Renko, Range Bars, Point & Figure.** `packages/core/src/chartTypes/{heikinAshi,renko,rangeBars,pointAndFigure}.ts`. These are pure compute fns; TV ships them as renderers wired to its proprietary engine. Ours are reusable.
- **Pluggable Renderer interface.** `packages/core/src/render/Renderer.ts`, `packages/core/src/render/SurfaceBackend.ts`. WebGL today, WebGPU on roadmap. TV's renderer is closed.
- **Signal-based reactivity that bridges three frameworks without proxy overhead.** `packages/core/src/reactivity/signal.ts:37-66`. ~120 LOC; no Vue proxy, no React strict-mode footgun.
- **Replay controller as first-class primitive.** `packages/core/src/replay/createReplayController.ts`. TV bar replay is a built-in feature, not exposed to the SDK.
- **Footprint diagonal-imbalance computation native.** `packages/core/src/components/footprint/types.ts:107-122`. TV requires custom Pine.

## Losing to TV (where we lose)

- **TV: `new TradingView.widget({container_id, symbol})` renders in one line.** Ours: install fails (BLOCKER-001), then if it builds, you need 4-12 lines of `useRef + useChart + style + factory registration` (MAJOR-001).
- **TV ships 400+ indicators, 110+ drawing tools, 21 chart types.** We ship ~30 indicators, 12 drawing primitives, 1 candlestick + a few alt chart types via `chartTypes/`. `docs/COMPETITIVE_ANALYSIS.md` already enumerates the gaps.
- **TV ships Pine Script for user-defined indicators.** We have no scripting layer. A user wanting "custom RSI variant" must write TS and rebuild.
- **TV ships in-app screener, broker integrations (100+), watchlist, multi-chart layouts.** Out of scope for us, but the developer judging the SDK on day one sees TV's polish.
- **TV has docs.** We have `docs/api.md` at 7 bytes (MAJOR-008).
- **TV's `debug: true` widget option dumps state.** We have nothing (MAJOR-002).
- **TV's widget README is on the npm page.** We have no per-package READMEs (BLOCKER-004).
- **TV's installation page works.** Ours doesn't (BLOCKER-001, BLOCKER-002, BLOCKER-003, BLOCKER-005).
- **TV supports 20+ languages in the UI.** We hardcode Chinese strings in the default catalog (MAJOR-011).
- **TV's error messages link to documentation.** Ours tell you to call `__setChartFactory` (MAJOR-005 worst-5).
- **TV's existing customers get an upgrade tutorial when a major ships.** Our legacy `@363045841yyt/klinechart` users get nothing (MAJOR-010).

## Top 5 fixes to ship before next public push

1. **Make `pnpm -r build` succeed.** Add `tsconfig.build.json` per package (extends parent, excludes tests), or change `build` scripts to use the existing `tsconfig.json`. Move the legacy `Chart` import out of `../../../../src/` into `packages/core/src/engine/` so it's inside `rootDir`. Verify with `npm pack --dry-run` per package. (Closes BLOCKER-001, BLOCKER-009.)
2. **Fix the install path so `npm install @klinechart-quant/react` works end-to-end on a fresh React 19 Next.js 15 app.** Move `@klinechart-quant/core` from `peerDependencies` to `dependencies` (with `workspace:^` rewritten on publish), bump every package from `0.0.0` to `0.1.0-alpha.0`, publish to npm. Add a per-package README with the 5-line install + first chart. (Closes BLOCKER-002, BLOCKER-003, BLOCKER-004.)
3. **Rewrite the root README.** Top section: "Packages". Four bullets, four install commands, four 5-line code samples. Move the legacy `@363045841yyt/klinechart` content under a `## Legacy v0.7` collapsible. Add a `Migration` link to `docs/MIGRATION.md` (which you write). (Closes BLOCKER-005, MAJOR-010.)
4. **Ship a working `examples/quickstart` runnable in 60 seconds.** Real OHLC data, real factory registered, candles on the screen. Link it from every README. Auto-mount-on-zero-size detection so the chart never silently renders into a 0×0 box. (Closes MAJOR-006, MAJOR-007, partly MAJOR-001.)
5. **Add `debug` + `diagnose()` to the controller surface.** `createChart({ container, data, debug: true })` logs every swallowed try/catch, every viewport change, every data ingest. `controller.diagnose()` returns `{ canvasSize, dataPointCount, visibleRange, lastError, factoryRegistered }`. Stop swallowing errors silently. (Closes MAJOR-002, partly MAJOR-015.)
