# Ecosystem Audit — @klinechart-quant

Date: 2026-05-29
Branch: `feat/renderer-interface`
Auditor scope: `packages/{core,react,vue,angular,ai-runtime}/`, `examples/{next-app,nuxt-app,angular-universal}/`, `docs/ROADMAP.md`, `docs/COMPETITIVE_ANALYSIS.md`.

---

## Verdict

**One sentence**: The bones are good (signal bridge math is correct in all three adapters, SSR contract is genuinely honoured at module-import time, tool schemas conform to MCP) — but the surface area is **two-thirds too small** (only `useChart` + `useIndicatorSelector` for 10 controllers) and the publish pipeline is missing **everything** that makes an npm release non-amateur (no CHANGELOG, no `.changeset`, no per-package LICENSE, no `workspace:*` rewrite story, zero sub-path exports despite a multi-pane chart engine, AI-runtime missing from core `exports` field, root package still named `@363045841yyt/klinechart` v0.7.0 — meaning today's `pnpm publish -r` would publish the legacy build alongside five v0.0.0 stubs).

**Framework idiom scores** (out of 10):

- **React**: 7/10 — `useSyncExternalStore` usage is textbook; ref-mutation-during-render at `packages/react/src/index.ts:115` is a smell; KLineChart drops `onLoad`/`onError`/`ref` forwarding.
- **Vue**: 6/10 — `shallowRef` rationale is correct; `defineComponent + h()` instead of `.vue` is buildability-driven and Evan You would accept it, but `useChart` captures `opts` by closure (not reactive), missing props are silently dropped.
- **Angular**: 7/10 — standalone + `OnPush` is correct; the explicit `DestroyRef` parameter for `coreSignalToAngular` is a clean disclosure of the injection-context constraint (not hacky); zoneless is verified by `examples/angular-universal/src/main.ts:6`. Missing: NgRx-style service token, attribute selector for ergonomics, `kline-chart` selector lacks `klc-` prefix convention.

**Publish-readiness**: **NOT shippable**. Six independent BLOCKER-class items before `pnpm publish -r` can be invoked safely.

---

## Findings (37 total)

### BLOCKER-001 — Missing per-framework hooks/composables/services for 8 of 10 controllers

**Files**: `packages/react/src/index.ts:1-255`, `packages/vue/src/index.ts:1-338`, `packages/angular/src/index.ts:1-225`.

**Issue**: Each adapter exports only two state primitives: `useChart`/`useIndicatorSelector` (React, Vue) and `KLineChartComponent` + `coreSignalToAngular` (Angular). Core exposes 10 controller factories: `createChartController`, `createIndicatorSelectorController`, `createToolbarController`, `createDrawingController`, `createAlertController` (`packages/core/src/alerts/index.ts:12`), `createReplayController` (`replay/index.ts:9`), `createVolumeProfileController` (`components/volumeProfile/index.ts:12`), `createAnchoredVwapController` (`components/anchoredVwap/index.ts:10`), `createFootprintController` (`components/footprint/index.ts:21`), `createHeatmapController` (`components/orderBookHeatmap/index.ts:12`), `createMtfController` (`components/mtfOverlay/index.ts:26`). That's **0 of 8 component controllers wrapped** in any adapter.

**User-side workaround**: Manually call `coreSignalToAngular(controller.someSignal)` / write a hook around `useSyncExternalStore` for every signal — repeatedly, in every component, with the same caching boilerplate that already exists at `packages/react/src/index.ts:175-202`.

**Fix**: Ship `useAlerts`, `useReplay`, `useVolumeProfile`, `useAnchoredVwap`, `useFootprint`, `useOrderBookHeatmap`, `useMtf`, `useToolbar`, `useDrawing` in each adapter. ~20 LOC per hook following the `useIndicatorSelector` template. Angular needs the same as `provideAlerts({factory: createAlertController})` provider + `inject(ALERT_CONTROLLER)` pattern.

### BLOCKER-002 — No CHANGELOG, no `.changeset`, no semantic-release config

**Files**: repo root (`find -maxdepth 2 \( -name CHANGELOG\* -o -name .changeset -o -name release.config\* \)` returns 0).

**Issue**: When `pnpm publish -r` runs, npm will see five packages at `0.0.0` with no version bumping logic, no automated changelog, and no semver-discipline gate. The `workspace:*` declarations in `packages/{react,vue,angular,ai-runtime}/package.json:43-46` will fail to resolve to a publishable version at pack time — pnpm rewrites `workspace:*` to the **current package version**, which is `0.0.0`, locking every adapter to depend on `@klinechart-quant/core@0.0.0`. After one publish nobody can bump independently.

**Fix**: Install `@changesets/cli`, run `changeset init`, configure `baseBranch: main` and `fixed: [['@klinechart-quant/*']]` in `.changeset/config.json` so adapters bump in lockstep with core for the v0.x phase. Document the release flow in `CONTRIBUTING.md`.

### BLOCKER-003 — Root package shadows scoped packages on publish

**Files**: `package.json:2` — `"name": "@363045841yyt/klinechart"`, `"version": "0.7.0"`, `"prepublishOnly": "pnpm run build-only"`.

**Issue**: `pnpm publish -r` walks the entire workspace, including the root. The root package is the legacy bundle; publishing it as part of an `@klinechart-quant` release will (a) ship the old Vue-only entry as the legacy artifact (intentional?), (b) trigger the build of `vite.config.ts` which is unrelated to the new packages, (c) confuse semver — the root is on 0.7.0, every adapter is on 0.0.0.

**Fix**: Set `"private": true` on the root, or move the legacy bundle into `packages/legacy-vue/` so it shares the workspace's release cadence and naming.

### BLOCKER-004 — Per-package LICENSE missing

**Files**: `find packages -maxdepth 2 -name "LICENSE*"` returns 0. Only the root `LICENSE` exists.

**Issue**: npm `files: ["dist","src"]` (e.g. `packages/react/package.json:17-20`) does **not** auto-include the repo-root LICENSE. Each published tarball ships without a license file, which (a) breaks corporate package-audit pipelines like `license-checker`/`oss-attribution-generator`, (b) is one of the top three `publint --strict` warnings.

**Fix**: Copy the root `LICENSE` (or generate via a `scripts/sync-license.mjs` pre-publish step) into each `packages/*/`. The legacy `Copyright (c) 2025 363045841` in `LICENSE:3` should also be reconciled with the `@klinechart-quant` org name.

### BLOCKER-005 — `workspace:*` peer deps will publish as `0.0.0` literal

**Files**: `packages/react/package.json:43`, `packages/vue/package.json:43`, `packages/angular/package.json:45`, `packages/ai-runtime/package.json:26`.

**Issue**: pnpm rewrites `workspace:*` to `^<currentVersion>` at pack time only if the publishing workflow uses `pnpm publish` from each package; if a consumer does `npm publish` or `yarn npm publish` it will fail to rewrite. Even with pnpm, the current `0.0.0` version becomes `^0.0.0` — semantically incompatible with the next `0.1.0` release. Combined with BLOCKER-002, every adapter pin is wrong from publish #1.

**Fix**: Switch to `"workspace:^"` (caret) for peer deps so pnpm rewrites to a proper caret. Pin `@klinechart-quant/core` to `^X.Y.Z` once a real version exists. Confirm with `pnpm publish --dry-run -r`.

### BLOCKER-006 — `@klinechart-quant/core` `exports` field omits subpath access to component controllers

**Files**: `packages/core/package.json:11-24`. Only `.`, `./reactivity`, `./controllers` are exposed.

**Issue**: `packages/core/README.md:104-110` claims sub-path imports work and even shows `import from '@klinechart-quant/core/reactivity'`. But the same user trying `import { createVolumeProfileController } from '@klinechart-quant/core/components/volumeProfile'` hits `ERR_PACKAGE_PATH_NOT_EXPORTED` under `node16` resolution. Tree-shakers will then pull the entire core barrel (every component, every alert kind, the whole render module) — defeating the explicit `sideEffects: false` win.

**Fix**: Add `./components/volumeProfile`, `./components/orderBookHeatmap`, `./components/footprint`, `./components/anchoredVwap`, `./components/mtfOverlay`, `./alerts`, `./replay`, `./chartTypes`, `./render`, `./scale`, `./scene` entries to `exports`. Mirror in `tsconfig.build.json` `outDir` so types resolve. Add a `publint` test that asserts no `ERR_PACKAGE_PATH_NOT_EXPORTED` for the documented paths.

### MAJOR-001 — React `<KLineChart>` drops `onLoad`, `onError`, `ref`, all event handlers

**File**: `packages/react/src/index.ts:215-240`.

**Issue**: `KLineChartProps` has 5 fields: `data`, `initialZoomLevel`, `theme`, `className`, `style`. A senior React user expects:

- `ref` forwarding (via `React.forwardRef<ChartController | null>` so the parent can imperatively call `setData`, `zoomToLevel`, etc. — this is the entire reason `useImperativeHandle` exists).
- `onReady(controller)` / `onError(err)` / `onZoomLevelChange(level, kWidth)` event props (the Vue adapter ships `ready` and `zoomLevelChange` at `packages/vue/src/index.ts:235-239` — feature parity drift).
- `onClick`, `onMouseEnter`, `onPointerDown`… i.e. a `data-testid` and `aria-label` passthrough.

Without `ref` forwarding, the convenience component is unusable for any non-trivial app — users will fall back to `useChart` immediately.

**Fix**: Wrap in `forwardRef`, add `useImperativeHandle(ref, () => controller, [controller])`, add `onReady`/`onError`/`onZoomLevelChange` event props, and pass `{...rest}` to the host div for native event handlers (spread `...rest` after `ref`/`className`/`style`).

### MAJOR-002 — React adapter mutates a ref during render

**File**: `packages/react/src/index.ts:114-115` — `const optsRef = useRef(opts); optsRef.current = opts`.

**Issue**: Assigning to `optsRef.current` during the render phase is a React anti-pattern. With React 18 concurrent mode + `<StrictMode>` (which `examples/next-app/next.config.mjs:11` enables via `reactStrictMode: true`), the render function runs **twice** in development. The second run overwrites the first run's snapshot with the same identity — usually harmless, but it interferes with React's Compiler memoization. The idiomatic fix is `useEffect(() => { optsRef.current = opts })` so the mutation happens after commit.

**Fix**: Move the assignment into a `useEffect` (or accept the closure-capture by including `opts` in the deps array of the mount effect; if you don't want re-mount, snapshot via `useMemo(() => opts, [])` for first-render only). React Compiler will flag this on `react-compiler` ESLint run.

### MAJOR-003 — Vue `useChart` captures `opts` by closure, never reacts to prop changes

**File**: `packages/vue/src/index.ts:125-164`.

**Issue**: `useChart(containerRef, opts)` is called once during `setup`; the closure pinned at `mountIfReady(el)` (`packages/vue/src/index.ts:133`) uses `opts` from that one invocation. If the parent passes `useChart(ref, { data: dataRef.value, theme: themeRef.value })`, subsequent `dataRef`/`themeRef` changes are lost — only the SFC component (`packages/vue/src/index.ts:271-283`) wires `watch(() => props.data, ...)` because there `data` IS reactive via Vue's prop system.

A Vue 3 user expects either (a) `useChart` accepts `MaybeRefOrGetter<ChartMountOptions>` and `watchEffect`'s through changes, or (b) the doc explicitly says "use the returned controller's `setData`/`setTheme`" — the README does neither, so the composable looks reactive and silently isn't.

**Fix**: Take `opts: MaybeRefOrGetter<Omit<ChartMountOptions, 'container'>>` and `watch(() => toValue(opts), (next) => chart.value?.setData(next.data) /* etc */)`. Or rename to `useChartOnce(...)` to honestly signal one-shot.

### MAJOR-004 — Angular component selector violates Angular style guide

**File**: `packages/angular/src/index.ts:148` — `selector: 'kline-chart'`.

**Issue**: Angular style guide [style 02-07](https://angular.dev/style-guide#do-use-a-custom-prefix-for-a-component-selector) mandates a custom prefix to namespace components. `kline-chart` collides with hypothetical other-vendor `kline-chart` (the term is too generic), and once a user installs both `@klinechart-quant/angular` and a competitor's package the template selector dispatch becomes ambiguous.

**Fix**: `selector: 'klc-chart'` (or `klq-chart`). Bonus: add an attribute selector form `'kline-chart, [klcChart]'` so users can attach to existing elements.

### MAJOR-005 — Angular `KLineChartComponent` does not expose `@Output()` events

**File**: `packages/angular/src/index.ts:153-205`.

**Issue**: The component exposes the controller via the `controller` public field but never emits viewport changes / mount events as `@Output()`. Angular template users cannot do `(viewportChange)="onZoom($event)"` — they must `@ViewChild(KLineChartComponent) get chart() { return this.cmp.controller }` and manually subscribe. Vue ships `ready` and `zoomLevelChange` (`packages/vue/src/index.ts:235-239`); React drops them entirely. **Three inconsistent shapes for the same convenience component.**

**Fix**: Add `@Output() ready = new EventEmitter<ChartController>()`, `@Output() viewportChange = new EventEmitter<ChartViewport>()`. Emit in `ngAfterViewInit` and inside the viewport subscription at `packages/angular/src/index.ts:199-203`.

### MAJOR-006 — Adapter `__set*Factory` calls at module init are documented as side-effect-free but ARE side effects

**Files**: `packages/react/src/index.ts:253-254`, `packages/vue/src/index.ts:336-337`. `__setChartFactory(createChartController)` is a top-level statement that mutates a module-level `let`.

**Issue**: The `sideEffects: false` flag (`packages/react/package.json:7`, `packages/vue/package.json:7`) instructs bundlers that the module CAN be dropped if no exports are referenced. But this is technically untrue — the factory-registration is observable across the module graph: a user who imports only `import { createChart } from '@klinechart-quant/react'` and never calls it still gets the side-effecting registration when the module evaluates. With aggressive tree-shaking + `pure_module` heuristics, the registration call could be dead-code-eliminated, causing a runtime "No ChartControllerFactory registered" throw (`packages/react/src/index.ts:55-59`).

The comment at `packages/react/src/index.ts:250-251` ("Importing the factory is side-effect-free at module load") is half-true: the **factory import** is pure, but the **registration call** is not.

**Fix**: Either (a) move the registration into a lazy path (e.g. inside `createChart` itself, `if (chartFactory === null) chartFactory = createChartController`), or (b) mark `__setChartFactory` calls as `/*#__PURE__*/` annotations and live with the test-only injection still working because tests call `__setChartFactory` directly. Option (a) is cleaner.

### MAJOR-007 — Tree-shaking analysis: ai-runtime ships every tool schema unconditionally

**Files**: `packages/ai-runtime/src/index.ts:18-27`, `toolSchemas.ts:244-249`.

**Issue**: `ALL_TOOLS` (`toolSchemas.ts:244`) is an exported `ReadonlyArray` constructed via spread of every group. A user who only registers `TOOL_GROUPS.navigation` still pays the full JSON payload (4 groups × ~3 schemas × ~600 bytes = ~7 KB ungzipped, ~2 KB gzipped) because `ALL_TOOLS` is referenced from the same module and bundlers cannot easily prove the spread is dead. Combined with the missing sub-path export `@klinechart-quant/ai-runtime/toolSchemas/alerts`, there's no path to a thin import.

**Fix**: Either (a) move `ALL_TOOLS` to a separate sub-path so consumers explicitly opt in: `@klinechart-quant/ai-runtime/all-tools`, or (b) accept the size (it's small) but verify with a `size-limit` budget — note `ai-runtime/package.json:21-23` does NOT define a `size-limit` config at all (BLOCKER-adjacent).

### MAJOR-008 — `@types/react` mismatch will hit React-18-only users

**Files**: `packages/react/package.json:44`, `packages/react/package.json:50` — peerDep `react: ^18 || ^19`, devDep `@types/react: ^19`.

**Issue**: A React 18 consumer installs `@types/react@18.x`. The adapter's `RefObject<HTMLElement | null>` (`packages/react/src/index.ts:107`) became valid in `@types/react@19`. In `@types/react@18.x`, `RefObject<T>` was `RefObject<T extends MutableRefObject<infer V> ? V : T>` (paraphrasing) — the consumer gets a type error: "Type 'RefObject<HTMLDivElement | null>' is not assignable to parameter of type 'RefObject<HTMLElement>'". Specifically, React 18's `useRef<HTMLDivElement>(null)` returns `RefObject<HTMLDivElement>` (non-nullable), but the adapter expects `RefObject<HTMLElement | null>`.

**Fix**: Either (a) widen the param to `RefObject<HTMLElement> | RefObject<HTMLElement | null>`, or (b) bump peer to `react: ^19` only and document the React-18 drop in the README. Option (a) is the user-friendly path.

### MAJOR-009 — Vue peer dep range starts at 3.4 with no justification; legacy users on 3.0/3.2 are excluded silently

**File**: `packages/vue/package.json:44` — `"vue": "^3.4.0"`.

**Issue**: The adapter uses `effectScope`, `shallowRef`, `onScopeDispose` — all of which existed since Vue 3.2.x. Why exclude 3.0–3.3? `defineComponent` + `h()` works everywhere. The README at `packages/vue/README.md:95` lists `^3.4` without rationale; the legacy `@363045841yyt/klinechart` (root `package.json:81`) requires `^3.5.0`. Inconsistent.

**Fix**: Either drop to `^3.3.0` (the version that introduced `defineModel` and is the realistic floor for new projects in 2026) or document the actual reason (it's likely "we test on 3.5, we have no reason to support older") in the README. The current range is a guess.

### MAJOR-010 — Angular adapter has no `provideKLineChartFeatures()` for hooking component controllers into DI

**File**: `packages/angular/src/index.ts:77-86`.

**Issue**: `provideKLineChart` accepts `theme` and `factory` only. An Angular user installing alerts cannot do `provideKLineChartFeatures(withAlerts(), withReplay({pacing: 'wall-clock'}))` (the standard Angular 17+ feature-flag DI pattern, e.g. `provideRouter(withInMemoryScrolling())`). Today the user has to call `createAlertController()` imperatively in a component's constructor — losing DI benefits like test-replacement, lazy-init, and module-scope sharing.

**Fix**: Adopt the Angular `provideX + withY` pattern. Each feature controller gets a `withAlerts()` token-emitting helper.

### MAJOR-011 — AI-runtime tool schemas do NOT conform to Anthropic Tool spec — only the MCP `Tool` shape

**Files**: `packages/ai-runtime/src/types.ts:35-53`, `packages/ai-runtime/src/toolSchemas.ts:21-237`.

**Issue**: Anthropic's Tool API (`messages.create({tools: [...]})`) expects `{ name, description, input_schema }`. The README correctly demonstrates the conversion at `packages/ai-runtime/README.md:32-36`: `tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))`. But that means every user writes the same mapping. The `safety` field (`packages/ai-runtime/src/types.ts:51`) and `outputSchema` (line 46) have no equivalent in Anthropic's wire format — they're dropped silently in the mapping.

More importantly, the **MCP Tool** spec (per the MCP TypeScript SDK) is `{ name, description, inputSchema }` (camelCase! — confirm against `@modelcontextprotocol/sdk` types). Anthropic uses `input_schema` (snake). These two are NOT the same shape. The README claim "Mirrors the MCP `Tool` shape so the same descriptors plug into an MCP server with zero conversion" (`packages/ai-runtime/src/types.ts:30-31`) is correct for MCP and false for Anthropic — but the README's example IS the Anthropic API. Mismatch between code comment and demo.

**Fix**: Ship two adapter functions: `toAnthropicTool(schema): { name, description, input_schema }` and `toMcpTool(schema): { name, description, inputSchema }`. Bonus: `toOpenAIFunction(schema): { type: 'function', function: { name, description, parameters } }`. ~10 LOC total. Or ship a `@klinechart-quant/ai-runtime/anthropic` sub-path with the pre-mapped array.

### MAJOR-012 — CJS consumer hits `ERR_REQUIRE_ESM`, no fallback shipped

**Files**: every adapter `package.json:6` — `"type": "module"` with `"main": "./dist/index.js"` (no `.cjs`).

**Issue**: A CJS consumer doing `const { KLineChart } = require('@klinechart-quant/react')` from a Node 20 CJS file gets `ERR_REQUIRE_ESM`. The legacy root package at `package.json:66-74` ships both — the new packages ship only ESM. This is a deliberate modern choice but it's undocumented; the README never says "ESM only — Node 22+ or use dynamic import". In contrast, the legacy bundle (which they're advertised as replacing) was dual-format.

**Fix**: Either (a) document loudly in each README under "Requirements: Node 22 (for `require(esm)`) or ESM-only consumer", or (b) emit a CJS shim via `tsup --format esm,cjs`. Option (a) is fine for 2026; option (b) is welcoming. Pick one and document.

### MAJOR-013 — `moduleResolution: bundler` works; `node16` breaks because exports map omits the trailing `/`-glob

**Files**: `packages/core/package.json:11-24`.

**Issue**: A consumer with `tsconfig.json: {moduleResolution: 'node16'}` doing `import { createSignal } from '@klinechart-quant/core/reactivity'` works. But `import type { ChartController } from '@klinechart-quant/core/controllers/types'` (which is what a user would naturally try after reading the README) fails — only `./controllers` (no nested paths) is exported. `bundler` resolution is more forgiving here than `node16`. This is the "did you remember to expose your types subpath" trap.

**Fix**: Add `"./controllers/types": "./dist/controllers/types.d.ts"` or use the wildcard form `"./controllers/*": "./dist/controllers/*.js"` paired with `"./controllers/*/index.d.ts"`. Test with `attw --pack` (the `lint:types` script is wired at `packages/react/package.json:31`).

### MAJOR-014 — `chart.dispose()` semantics not documented as required in React/Vue/Angular READMEs; only Core README has it

**Files**: `packages/core/README.md:91-97`, `packages/react/README.md:32-46`, `packages/vue/README.md:25-43`, `packages/angular/README.md:50-66`.

**Issue**: The core README describes the dispose contract. None of the framework READMEs do. A user reading only the React README might call `createChart(opts)` imperatively (encouraged in the README) and never know they need to call `controller.dispose()`. Memory leaks are silent and only show up after a few hot-reload cycles.

**Fix**: Add a "Cleanup" subsection to each adapter README explaining that `useChart`/`<KLineChart>` handle it automatically, but `createChart` is "bring your own dispose".

### MAJOR-015 — `<kline-chart>` Angular component never reacts to `@Input() data` changes after mount

**File**: `packages/angular/src/index.ts:154-205`.

**Issue**: `data: ReadonlyArray<KLineData> = []` is captured once inside `ngAfterViewInit` (`packages/angular/src/index.ts:188-194`) and passed to the factory. If the parent template binds `[data]="signal()"` and the signal updates, the chart silently ignores it — no `ngOnChanges`, no `effect()`, no `setData` push. Compare to the Vue SFC which DOES watch (`packages/vue/src/index.ts:272-283`).

**Fix**: Implement `OnChanges` (or `effect(() => this.controller?.setData(this.dataInput()))` if you migrate to signal inputs via `input()` from Angular 17.1+). The Angular 17.3+ signal-input form is the idiomatic 2026 answer.

### MAJOR-016 — `size-limit` configs measure pre-build source, not the publishable dist

**Files**: `packages/react/package.json:33-41`, `packages/vue/package.json:33-41`, `packages/angular/package.json:33-41`, `packages/core/package.json:41-48`.

**Issue**: All four `size-limit` `path` fields point at `src/index.ts` (e.g. `packages/react/package.json:36`). That measures the un-minified, un-tree-shaken source. The actual user impact is `dist/index.js` after consumer-side tree-shaking. The budget is therefore meaningless — it might pass with a 50% margin while the real shipped bundle is over.

**Fix**: Change `path` to `dist/index.js`, run after `build`, and verify against a real bundler (size-limit can drive Webpack/Rollup). 8 KB gzipped on a controller-rich React adapter is unrealistic — once 8 hooks are added, that number doubles.

### MAJOR-017 — `ai-runtime/package.json` lacks `size-limit`, `publint`, `attw` scripts

**File**: `packages/ai-runtime/package.json:21-24` only ships `build` and `test`.

**Issue**: Every other publishable package has `size`, `lint:publish`, `lint:types`. `ai-runtime` is the AI-differentiation package and the one most likely to grow rapidly (provider adapters incoming) — it's the package most needing budget discipline.

**Fix**: Mirror the four scripts from `packages/react/package.json:25-32`.

### MAJOR-018 — Adapter `createChart` imperative API in React doesn't accept the `factory` injection that Angular's does

**Files**: `packages/react/src/index.ts:75-86`, `packages/angular/src/index.ts:128-141`.

**Issue**: Angular's `createChart` allows `opts.factory` for non-DI contexts (`packages/angular/src/index.ts:129`). React's only resolves from module-level state (`packages/react/src/index.ts:84`). Three frameworks, three different shapes for the same imperative call.

**Fix**: Either (a) all three accept `opts.factory?: ChartControllerFactory` for symmetry, or (b) none do (recommended: option (b), since the React module-init pattern is cleaner — then drop the param from Angular too and rely on DI exclusively).

### MAJOR-019 — Vue `KLineChart` SFC component does not expose `'theme-change'` event despite watching theme

**File**: `packages/vue/src/index.ts:278-283`.

**Issue**: `watch(() => props.theme, (next) => chart.value?.setTheme(next))` reacts inside the component. But the component emits no event when theme changes — so a parent that wants to coordinate with surrounding UI (footer-theming, syntax-highlight, etc.) cannot. Minor in isolation; significant alongside MAJOR-005 (no Angular events) and MAJOR-001 (no React events).

**Fix**: Add `'theme-change'` to `emits` and emit inside the watcher. Also document the existing `ready` and `zoom-level-change` events in the README, which **does not mention them at all** (`packages/vue/README.md:11-22`).

### MAJOR-020 — Nuxt example documents `build.transpile` but production users won't need it (and we don't say so)

**Files**: `examples/nuxt-app/nuxt.config.ts:10-12`, `packages/vue/README.md:79-84`.

**Issue**: `build.transpile: ['@klinechart-quant/vue', '@klinechart-quant/core']` is required ONLY because the example imports from workspace `src/` (no `dist/` exists yet). The README admits this at `packages/vue/README.md:84` ("Drop once we ship a built `dist/` to npm"), but the same line is left unconditional in the Nuxt config so a copy-paste consumer will keep the transpile rule forever, missing Nuxt's optimization opportunities.

**Fix**: README must say "If installing from npm (post-`dist`), this `transpile` rule is NOT needed". The Nuxt config should comment "REMOVE WHEN INSTALLING FROM NPM".

### MAJOR-021 — Angular adapter declares `rxjs` as peer dep but never imports it

**File**: `packages/angular/package.json:46` — `"rxjs": "^7.0.0"`.

**Issue**: `grep rxjs packages/angular/src/index.ts` → 0 results. The adapter is RxJS-free (it uses `inject(DestroyRef)` + manual `unsubscribe`). Listing `rxjs` as a peer means a consumer who chose Angular's `@angular/core` signals + no RxJS gets a spurious install requirement.

**Fix**: Drop `rxjs` from peerDependencies. Angular itself depends on it, so the consumer always has it transitively, but declaring it our peer is misleading.

### MAJOR-022 — All adapters auto-register factory at module init, breaking ESM tree-shaking benefits

**Files**: `packages/react/src/index.ts:253-254`, `packages/vue/src/index.ts:336-337`.

**Issue**: Importing the adapter — even just `import type { ChartMountOptions } from '@klinechart-quant/react'` — pulls in `createChartController` from core because the registration line is unconditional. That in turn imports the entire legacy `Chart` from `src/core/chart.ts` (`packages/core/src/controllers/createChartController.ts:47`). The result: a user wanting only the TYPE imports the entire 2150-LOC engine. Bundler `sideEffects: false` won't save them because the side-effect IS the import-and-call chain.

**Fix**: Implement lazy registration inside `createChart`. The cost: the test-only `__setChartFactory(null)` reset stops working as a teardown. Acceptable trade.

### MINOR-001 — README at `packages/core/README.md:103-110` advertises subpath exports that don't all exist

See BLOCKER-006. Concrete subpath examples in the README will 404 today.

### MINOR-002 — `JsonSchema` union in `ai-runtime/types.ts:59-68` lacks JSON-Schema `$ref`, `format`, `default`

**File**: `packages/ai-runtime/src/types.ts:59-68`.

**Issue**: The narrowed union excludes commonly used JSON Schema features. Tool authors who need `format: 'date-time'` or `default: 0` can't express it. Many MCP servers expect `$ref` to share definitions across tools.

**Fix**: Add `format`, `default`, and `$ref` to relevant union members. Or accept the limitation and document it explicitly as "JSON-Schema subset".

### MINOR-003 — `chart.zoomToLevel` MCP tool schema (`toolSchemas.ts:31-43`) requires `level` but type allows decimals

**File**: `packages/ai-runtime/src/toolSchemas.ts:31-43`.

**Issue**: `level` is `type: 'integer', minimum: 1, maximum: 20` but `ChartController.zoomToLevel(level: number, anchorX?: number)` (`packages/core/src/controllers/types.ts:189`) accepts a `number`. If the LLM is told the API takes integers and the core accepts floats, intermediate zoom (level 5.5) is silently unreachable through tool calls.

**Fix**: Align both — either schema becomes `type: 'number'` or core enforces integer rounding. Probably the latter (discrete zoom levels are a UX promise of the engine).

### MINOR-004 — `useIndicatorSelector` (React) caches snapshot but `add`/`remove` methods are re-bound every snapshot construction

**File**: `packages/react/src/index.ts:194-201`.

**Issue**: When the cache misses (catalog or active changes), `selector.add.bind(selector)` and `selector.remove.bind(selector)` are recreated. This re-binding triggers prop-change re-renders downstream if a child component takes `add` as a prop and uses `React.memo`. Tiny perf bug, real consequence in indicator-picker UIs.

**Fix**: `useMemo(() => ({ add: selector.add.bind(selector), remove: selector.remove.bind(selector) }), [selector])`, then merge with catalog/active.

### MINOR-005 — Angular `coreSignalToAngular` does not use `assertInInjectionContext`

**File**: `packages/angular/src/index.ts:103-114`.

**Issue**: When called outside an injection context without an explicit `destroyRef`, `inject(DestroyRef)` throws a cryptic "NG0203" error. The function should either explicitly call `assertInInjectionContext('coreSignalToAngular')` for a clear error, or accept `null` as a "no auto-cleanup" signal.

**Fix**: Add `if (destroyRef === undefined) assertInInjectionContext('coreSignalToAngular(): pass an explicit DestroyRef or call inside an injection context')`. Two lines.

### MINOR-006 — No `engines.node` field in adapter `package.json`s

**Files**: `packages/react/package.json` through `packages/ai-runtime/package.json`.

**Issue**: Root package sets `"engines": { "node": "^20.19.0 || >=22.12.0" }` (`package.json:44-46`). None of the publishable packages do. npm will use the consumer's Node version without warning if they're on 18. ESM-only + `import.meta` will silently break in older Node.

**Fix**: Copy the engines field to each publishable package. Same Node floor as the root.

### MINOR-007 — `useChart` (Vue) calls `mountIfReady` synchronously then immediately registers a watcher with `immediate: true`

**File**: `packages/vue/src/index.ts:138-147`.

**Issue**: `mountIfReady(containerRef.value)` runs synchronously, then `watch(containerRef, mountIfReady, { immediate: true })` runs `mountIfReady` again on the same value. The internal `if (chart.value != null) return` early-returns on the second call, but it's wasted work and confusing. Either remove the synchronous call or remove `immediate: true`.

**Fix**: Drop the synchronous `mountIfReady(containerRef.value)` and let the watcher handle the initial mount via `immediate: true`.

### MINOR-008 — README claims "tested with `provideExperimentalZonelessChangeDetection`" — only one smoke test exists

**File**: `packages/angular/README.md:74`, `examples/angular-universal/src/main.ts:6`.

**Issue**: The claim is true — the example IS zoneless — but there's no automated regression test that the adapter still works after a future PR introduces a zone-dependent API. The smoke is one-off.

**Fix**: Add a `vitest` contract test in `packages/angular/src/__tests__/contract.zoneless.test.ts` that bootstraps a fake injector with zoneless and verifies `KLineChartComponent` works.

### MINOR-009 — `Anthropic` model name in README is `claude-opus-4-7` — outdated by your date

**File**: `packages/ai-runtime/README.md:31`.

**Issue**: As of 2026-05-29, the current Opus model id is `claude-opus-4-7`. Confirm with Anthropic's docs and update if the README falls behind. (Today this matches — but `0.0.0` packages ship with this README — pin a known-good model alias like `claude-opus-latest`.)

**Fix**: Use the version-agnostic alias.

### MINOR-010 — Examples README missing CI verification

**File**: `examples/README.md` (referenced; brief check).

**Issue**: No CI job in `.github/workflows/` runs `next build`, `nuxt build`, or `ng build` against the examples. SSR safety is enforced only on the author's machine. Tomorrow's PR can regress and no signal will fire.

**Fix**: Add `examples-build.yml` workflow that runs all three example builds per PR. Failure = SSR contract broken.

### MINOR-011 — `chart.setData` `setTheme` etc are imperative on the controller but Vue SFC always re-derives from props

See MAJOR-015 for Angular variant. Vue at least watches; Angular doesn't. Inconsistency.

### MINOR-012 — Vue `KLineChart` SFC pinned to `'klinechart-quant-root'` class with no escape hatch

**File**: `packages/vue/src/index.ts:303-305`.

**Issue**: The class is hardcoded and merged with user `containerClass`. A user wanting to drop the `klinechart-quant-root` selector entirely (CSS reset) cannot. Trivial but the kind of thing senior users notice on first install.

**Fix**: Take a `rootClass?: string | null` prop where `null` skips the default class.

### MINOR-013 — `next-app` example uses `JSX.Element` return type; deprecated in React 19 types

**Files**: `examples/next-app/app/page.tsx:20`, `examples/next-app/app/chart.tsx:23`.

**Issue**: React 19 removes the global `JSX` namespace and recommends `import { type JSX } from 'react'`. The current code relies on `tsconfig.json` JSX runtime to keep `JSX.Element` ambient. Fragile on a `@types/react@19` strict consumer.

**Fix**: Replace with `React.JSX.Element` or just `React.ReactElement`. Consistency check across all examples.

---

## Tree-shaking analysis (concrete)

- **packages/core** — `sideEffects: false` at `packages/core/package.json:7`. Source has no module-level side effects (the index is a pure re-export barrel at `packages/core/src/index.ts:1-13`). However, the barrel re-exports **every** component controller — a user importing `import { createSignal } from '@klinechart-quant/core'` (bypass the sub-path) will pull the entire footprint/volumeProfile/orderBookHeatmap module graph unless the bundler perfectly proves dead code. **Verdict: OK in theory, footgun in practice.** Push users to sub-path imports + fix BLOCKER-006.

- **packages/react** — `sideEffects: false` at `packages/react/package.json:7`. **VIOLATION**: `packages/react/src/index.ts:253-254` calls `__setChartFactory(createChartController)` at module init. This is a side effect. Bundlers will likely keep it (good for runtime, bad for the flag's veracity). Result: importing **anything** from the React adapter pulls the full `createChartController` + legacy `Chart` engine. ~30 KB before user code.

- **packages/vue** — same shape, `packages/vue/src/index.ts:336-337`. Same violation.

- **packages/angular** — `sideEffects: false` at `packages/angular/package.json:7`. The factory is wired via the `InjectionToken` factory at `packages/angular/src/index.ts:60`, so it's lazily evaluated by Angular's DI — NOT at module init. **Cleanest tree-shake of the three.** Confirm via: `import { provideKLineChart } from '@klinechart-quant/angular'` should produce ~2 KB minified if Angular's bundler is set up correctly.

- **packages/ai-runtime** — `sideEffects: false` at `packages/ai-runtime/package.json:7`. Re-export barrel at `packages/ai-runtime/src/index.ts`. The `ALL_TOOLS` array (`toolSchemas.ts:244`) is referenced from the same module as the per-group exports — a user who only imports `TOOL_GROUPS.alerts` will still bring `ALL_TOOLS` into the bundle if the bundler can't prove independence. See MAJOR-007.

---

## React / Vue / Angular idiom scores

- **React: 7/10** — `useSyncExternalStore` with stable `subscribe` via `useMemo` (`packages/react/src/index.ts:162-172`) is exactly what Dan Abramov would write. Snapshot caching via ref is correct (`packages/react/src/index.ts:177-202`). Three things drop this from a 9: (1) ref mutation during render (MAJOR-002), (2) `<KLineChart>` drops `ref`/event-forward (MAJOR-001), (3) the auto-registration side effect (MAJOR-006) undermines `sideEffects: false`. With those three fixed, this is best-in-class for a financial chart React binding.

- **Vue: 6/10** — `shallowRef` rationale is correct (`packages/vue/src/index.ts:106-113` + `packages/vue/README.md:86-88`). `defineComponent + h()` is a defensible compromise for buildability (Evan You would accept the "we want plain `tsc` to publish" argument). What drops it: (1) `useChart` opts captured by closure with no `MaybeRefOrGetter` (MAJOR-003) — every Vue 3 binding shipped in 2026 takes `MaybeRefOrGetter`, (2) silent prop-drop in `<KLineChart>` (no `style`/`event-handler` passthrough), (3) inconsistent reactive contract between composable and SFC. With (1) fixed, this jumps to 8.

- **Angular: 7/10** — `provideKLineChart()` matches the `provideRouter()`-era Angular idiom (`packages/angular/src/index.ts:77`). `OnPush` + `inject(DestroyRef)` is the 17+ playbook. `coreSignalToAngular` is genuinely a clean abstraction. What drops it: (1) generic `kline-chart` selector (MAJOR-004), (2) no `@Output` events (MAJOR-005), (3) no `OnChanges` for `data` input (MAJOR-015), (4) no `withFeatures()` DI helper (MAJOR-010), (5) rxjs in peerDeps with zero usage (MAJOR-021). Fixed: this becomes the strongest of the three because of the lazy DI tree-shake.

---

## Publish hygiene checklist

- [ ] LICENSE per package — **MISSING** (BLOCKER-004; only root has it)
- [ ] CHANGELOG.md — **MISSING** (BLOCKER-002; no `.changeset` either)
- [x] README per package — present, but per-adapter READMEs omit events, dispose, and SSR-test claim is unverified (MINOR-008, MAJOR-014, MAJOR-020)
- [x] publishConfig.provenance — set on all five packages (`packages/{core,react,vue,angular,ai-runtime}/package.json:21-24` / `:32-35`)
- [x] sideEffects: false — set on all five, but React + Vue VIOLATE the flag at runtime (MAJOR-006, "Tree-shaking analysis")
- [~] exports field — present, but core misses subpaths for components/alerts/replay/etc (BLOCKER-006)
- [ ] Changesets setup for `workspace:*` → semver replacement — **MISSING** (BLOCKER-002, BLOCKER-005)
- [ ] Per-package `engines.node` (MINOR-006)
- [ ] CI for examples (MINOR-010)
- [ ] CJS shim or documented ESM-only requirement (MAJOR-012)
- [ ] Aligned `@types/react` testing on `react@18` (MAJOR-008)
- [ ] `size-limit` measures dist not src (MAJOR-016)
- [ ] `ai-runtime` size/lint scripts (MAJOR-017)

---

## Top 10 ecosystem fixes for publish (priority order)

1. **Set `"private": true` on root `package.json`**, OR move the legacy bundle into `packages/legacy-vue/` (BLOCKER-003). Without this, `pnpm publish -r` is dangerous.
2. **`pnpm dlx changesets init`** + configure `fixed: [['@klinechart-quant/*']]` so v0.x adapters bump in lockstep with core (BLOCKER-002, BLOCKER-005).
3. **Copy `LICENSE` into every `packages/*/`** via a `scripts/sync-license.mjs` pre-publish step (BLOCKER-004). Update copyright to `@klinechart-quant org`.
4. **Add 8 missing hooks/composables/services** per adapter (BLOCKER-001). The Volume Profile, Anchored VWAP, Footprint, Order Book Heatmap, MTF, Alerts, Replay, and Chart Types controllers exist in core but have no idiomatic framework binding.
5. **Expand `@klinechart-quant/core` `exports` field** with explicit subpaths for `components/*`, `alerts`, `replay`, `chartTypes`, `render`, `scale`, `scene` (BLOCKER-006). Make the README's promised subpath imports actually work.
6. **Lazy-register the controller factory** inside `createChart` instead of at module init (MAJOR-006, MAJOR-022). Restores the `sideEffects: false` veracity and enables real tree-shaking for type-only imports.
7. **`forwardRef` + `useImperativeHandle` for React `<KLineChart>`**, plus `onReady`/`onError`/event passthrough (MAJOR-001). Equalize feature parity with the Vue SFC's `ready` event.
8. **`MaybeRefOrGetter<ChartMountOptions>` for Vue `useChart`** (MAJOR-003). Silent broken reactivity is the worst kind of bug.
9. **Angular `@Output()` events + `OnChanges` data sync** (MAJOR-005, MAJOR-015). Right now the Angular component is a write-only black box.
10. **Ship `toAnthropicTool`/`toMcpTool`/`toOpenAIFunction` mappers** from `ai-runtime` and add a `@klinechart-quant/ai-runtime/anthropic` sub-path (MAJOR-011). Stop making every consumer write the same `tools.map` boilerplate.

Bonus: add a `examples-build.yml` CI workflow (MINOR-010) so the next regression in SSR safety is caught by the bot, not by an audit a month later.

---

## Would Dan/Evan/Sarah ship this?

**Dan Abramov** would ship the React adapter **after** MAJOR-001/002/006 are fixed — the `useSyncExternalStore` skeleton is right, and that's the hardest part. He'd want `ref` forwarding before he'd recommend it.

**Evan You** would ship the Vue adapter **after** MAJOR-003 is fixed — the `MaybeRefOrGetter` ergonomic is what Vue 3 users expect in 2026. He'd accept `defineComponent + h()` over `.vue` for the publishable layer.

**Sarah Drasner** would ship the Angular adapter **after** MAJOR-004/005/015 — the standalone-component + DI shape is correct, but the generic selector and the write-only Input would block her review.

**Choice over TradingView's React/Vue/Angular adapters today**? **No** — TradingView's adapters ship `forwardRef`, event passthrough, and full feature surface. We're shipping 80% of the architecture and 20% of the surface area. Six weeks of focused work on the 10 fixes above closes the gap; without them, this is a v0.0.0 that nobody senior would adopt.
