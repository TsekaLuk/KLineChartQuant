/**
 * @klinechart-quant/vue — public API surface.
 *
 * Vue 3 bindings for @klinechart-quant/core. Bridges core signals to Vue's
 * reactivity via `shallowRef` + `effect` so each adapter owns its own
 * reactivity boundary — no proxy wrapping of immutable signal values.
 *
 * Backward-compatibility contract: `KMapPlugin.install(app)` MUST exist
 * because legacy users of `@363045841yyt/klinechart` consume it.
 */

import { KLineChartError } from '@klinechart-quant/core'

import {
    defineComponent,
    effectScope,
    h,
    onBeforeUnmount,
    onMounted,
    onScopeDispose,
    onUnmounted,
    shallowRef,
    watch,
    type App,
    type PropType,
    type Ref,
} from 'vue'
import type { Signal } from '@klinechart-quant/core/reactivity'
import type {
    ChartController,
    ChartControllerFactory,
    ChartMountOptions,
    IndicatorSelectorController,
    KLineData,
} from '@klinechart-quant/core'

export type {
    ChartController,
    ChartMountOptions,
    IndicatorSelectorController,
} from '@klinechart-quant/core'

// ---------------------------------------------------------------------------
// Controller factory injection
//
// The concrete `createChartController` from packages/core/src/controllers/
// (Phase 1A deliverable) is not yet wired. Adapters and tests inject a
// factory via `__setControllerFactory` so the public API surface stays stable.
// ---------------------------------------------------------------------------

let controllerFactory: ChartControllerFactory | null = null

/**
 * Inject the ChartController factory. Called by:
 *   - the core package's bootstrap once `createChartController` is implemented
 *   - tests that need a mock controller
 */
export function __setControllerFactory(
    factory: ChartControllerFactory | null,
): void {
    controllerFactory = factory
}

// ---------------------------------------------------------------------------
// createChart — imperative mount
// ---------------------------------------------------------------------------

/**
 * Imperative mount API. Returns a controller; caller is responsible for `dispose`.
 *
 * Throws if container is null/undefined (SSR-safe guard).
 */
export function createChart(opts: ChartMountOptions): ChartController {
    if (opts.container == null) {
        throw new KLineChartError(
            'CONTROLLER_CONFIG_INVALID',
            '[@klinechart-quant/vue] createChart: `container` is required and must be a non-null HTMLElement',
        )
    }
    if (controllerFactory === null) {
        throw new KLineChartError(
            'CONTROLLER_CONFIG_INVALID',
            '[@klinechart-quant/vue] createChart: no ChartController factory registered. ' +
                'Call __setControllerFactory(...) before mounting (the core package wires this in production).',
        )
    }
    return controllerFactory(opts)
}

// ---------------------------------------------------------------------------
// coreSignalToVueRef — reactivity bridge
//
// Subscribe to a core Signal and mirror its value in a shallowRef. Auto-cleanup
// on component teardown via onScopeDispose (works inside effectScope or SFC).
// ---------------------------------------------------------------------------

/**
 * Bridge a core Signal<T> into a Vue Ref<T> backed by `shallowRef`.
 *
 * We use `shallowRef` (not `ref`) because:
 *   - core signal values are treated as immutable; deep proxying is wasteful
 *   - `Object.is` short-circuits in the core depend on referential equality,
 *     which Vue's deep reactivity would silently break
 *
 * Subscription is torn down via `onScopeDispose`, so this is safe to call
 * inside a Vue component setup, a composable, or a manually-created
 * `effectScope`. Calling it outside any scope still returns a working ref —
 * the caller is then responsible for unsubscribing.
 */
export function coreSignalToVueRef<T>(signal: Signal<T>): Ref<T> {
    const ref = shallowRef(signal.peek()) as Ref<T>
    const unsub = signal.subscribe(() => {
        ref.value = signal.peek()
    })
    onScopeDispose(unsub)
    return ref
}

// ---------------------------------------------------------------------------
// useChart — composable
// ---------------------------------------------------------------------------

/**
 * Composable. Pass a template ref to the container element.
 *
 * Watches `containerRef` to populate; once it does, calls `createChart`
 * and exposes the controller via a `shallowRef`. Disposes on scope teardown.
 */
export function useChart(
    containerRef: Ref<HTMLElement | null>,
    opts: Omit<ChartMountOptions, 'container'>,
): { chart: Ref<ChartController | null> } {
    const chart = shallowRef<ChartController | null>(null)

    const mountIfReady = (el: HTMLElement | null): void => {
        if (el == null || chart.value != null) return
        chart.value = createChart({ ...opts, container: el })
    }

    // Mount synchronously if the ref is already populated (e.g. SFC where the
    // template ref is set before this composable's effect runs).
    mountIfReady(containerRef.value)

    // Otherwise watch for the ref to populate.
    const stopWatch = watch(
        containerRef,
        (el) => {
            mountIfReady(el)
        },
        { immediate: true, flush: 'post' },
    )

    const dispose = (): void => {
        stopWatch()
        const ctrl = chart.value
        if (ctrl != null) {
            ctrl.dispose()
            chart.value = null
        }
    }

    onScopeDispose(dispose)
    // Belt-and-braces: SFC components running outside a manual scope still get
    // unmount cleanup via the component lifecycle hook.
    onBeforeUnmount(dispose)

    return { chart }
}

// ---------------------------------------------------------------------------
// useIndicatorSelector — composable
// ---------------------------------------------------------------------------

/**
 * Bridge the IndicatorSelectorController's catalog + active signals into
 * Vue shallowRefs. Returns refs and mutation methods (forwarded directly).
 */
export function useIndicatorSelector(controller: ChartController): {
    catalog: Ref<ReturnType<IndicatorSelectorController['catalog']>>
    active: Ref<ReturnType<IndicatorSelectorController['active']>>
    add: IndicatorSelectorController['add']
    remove: IndicatorSelectorController['remove']
} {
    const selector = controller.indicatorSelector
    const catalog = shallowRef(selector.catalog.peek()) as Ref<
        ReturnType<IndicatorSelectorController['catalog']>
    >
    const active = shallowRef(selector.active.peek()) as Ref<
        ReturnType<IndicatorSelectorController['active']>
    >

    // Subscribe directly to each signal — no need for full `effect` tracking
    // since each shallowRef maps to exactly one signal.
    const unsubCatalog = selector.catalog.subscribe(() => {
        catalog.value = selector.catalog.peek()
    })
    const unsubActive = selector.active.subscribe(() => {
        active.value = selector.active.peek()
    })

    onScopeDispose(() => {
        unsubCatalog()
        unsubActive()
    })

    return {
        catalog,
        active,
        add: (definitionId: string) => selector.add(definitionId),
        remove: (instanceId: string) => selector.remove(instanceId),
    }
}

// ---------------------------------------------------------------------------
// <KLineChart /> SFC-equivalent component
//
// Implemented with defineComponent + render function rather than a `.vue`
// SFC to keep the package buildable with plain `tsc` (no SFC compiler in
// the publishable pipeline). Mirrors the legacy KLineChart.vue prop names
// that downstream consumers depend on.
// ---------------------------------------------------------------------------

export const KLineChart = defineComponent({
    name: 'KLineChart',
    props: {
        data: {
            type: Array as PropType<ReadonlyArray<KLineData>>,
            required: true,
        },
        initialZoomLevel: { type: Number, default: 3 },
        zoomLevels: { type: Number, default: 20 },
        theme: {
            type: String as PropType<'light' | 'dark'>,
            default: 'light',
        },
        /** custom class for the chart container root */
        containerClass: { type: String, default: '' },
        /**
         * Controlled fullscreen flag (v-model:fullscreen). When it transitions
         * to true the root host element enters browser fullscreen; when false
         * it exits. Browser-driven changes (Esc / F11) are reflected back via
         * the `update:fullscreen` emit. Default false.
         */
        fullscreen: { type: Boolean, default: false },
    },
    emits: {
        ready: (_controller: ChartController) => true,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        zoomLevelChange: (_level: number, _kWidth: number) => true,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        'update:fullscreen': (_value: boolean) => true,
    },
    setup(props, { emit, expose }) {
        const containerRef = shallowRef<HTMLElement | null>(null)
        const scope = effectScope()

        const chart = shallowRef<ChartController | null>(null)

        // -------------------------------------------------------------------
        // Fullscreen: pure DOM concern on the existing root host element.
        // SSR / jsdom safe — every document/element access is guarded, and
        // the Fullscreen API methods are feature-detected before calling.
        // -------------------------------------------------------------------

        const requestFullscreen = (): void => {
            if (typeof document === 'undefined') return
            const el = containerRef.value
            if (el == null) return
            if (typeof el.requestFullscreen !== 'function') return
            // Browser returns a Promise; swallow rejection (e.g. no user gesture)
            // without throwing so the controlled prop stays the source of truth.
            void Promise.resolve(el.requestFullscreen()).catch(() => {})
        }

        const exitFullscreen = (): void => {
            if (typeof document === 'undefined') return
            if (document.fullscreenElement == null) return
            if (typeof document.exitFullscreen !== 'function') return
            void Promise.resolve(document.exitFullscreen()).catch(() => {})
        }

        const onFullscreenChange = (): void => {
            if (typeof document === 'undefined') return
            emit('update:fullscreen', document.fullscreenElement === containerRef.value)
        }

        onMounted(() => {
            const el = containerRef.value
            if (el == null) return
            scope.run(() => {
                chart.value = createChart({
                    container: el,
                    data: props.data,
                    initialZoomLevel: props.initialZoomLevel,
                    zoomLevels: props.zoomLevels,
                    theme: props.theme,
                })
                if (chart.value != null) {
                    emit('ready', chart.value)
                    // Bridge viewport changes back out as zoomLevelChange.
                    const ctrl = chart.value
                    const emitViewport = (): void => {
                        const vp = ctrl.viewport.peek()
                        emit('zoomLevelChange', vp.zoomLevel, vp.kWidth)
                    }
                    emitViewport()
                    const unsub = ctrl.viewport.subscribe(emitViewport)
                    onScopeDispose(unsub)
                }
            })

            // React to prop changes: data + theme.
            watch(
                () => props.data,
                (next) => {
                    chart.value?.setData(next)
                },
            )
            watch(
                () => props.theme,
                (next) => {
                    chart.value?.setTheme(next)
                },
            )

            // Subscribe to browser-driven fullscreen changes (Esc / F11) so the
            // consumer's bound state stays in sync. Registered on mount, removed
            // on unmount — no leaks.
            if (typeof document !== 'undefined') {
                document.addEventListener('fullscreenchange', onFullscreenChange)
            }

            // React to the controlled `fullscreen` prop transitions.
            watch(
                () => props.fullscreen,
                (next) => {
                    if (next) {
                        requestFullscreen()
                    } else {
                        exitFullscreen()
                    }
                },
            )

            // Apply the initial controlled state if it mounts already true.
            if (props.fullscreen) {
                requestFullscreen()
            }
        })

        onUnmounted(() => {
            if (typeof document !== 'undefined') {
                document.removeEventListener(
                    'fullscreenchange',
                    onFullscreenChange,
                )
            }
            chart.value?.dispose()
            chart.value = null
            scope.stop()
        })

        expose({
            getController: (): ChartController | null => chart.value,
        })

        const setContainerRef = (el: unknown): void => {
            containerRef.value = (el as HTMLElement | null) ?? null
        }

        return () =>
            h('div', {
                ref: setContainerRef,
                class: ['klinechart-quant-root', props.containerClass]
                    .filter(Boolean)
                    .join(' '),
                style: { width: '100%', height: '100%' },
            })
    },
})

// ---------------------------------------------------------------------------
// KMapPlugin — legacy Vue plugin
//
// PRESERVE THIS EXACT SHAPE — legacy consumers do:
//   import { KMapPlugin } from '@363045841yyt/klinechart'
//   app.use(KMapPlugin)
// ---------------------------------------------------------------------------

export const KMapPlugin = {
    install(app: App): void {
        app.component('KLineChart', KLineChart)
    },
}

// ---------------------------------------------------------------------------
// Auto-register the production ChartControllerFactory
//
// Consumers don't need to call __setControllerFactory manually unless they
// want to inject a custom backing (e.g. for testing). Contract tests
// override via __setControllerFactory in their setup and reset to null in
// afterEach, so this default registration is transparent to them.
//
// Importing the factory is side-effect-free at module load — the engine's
// DOM access only happens when `createChart(opts)` is actually called.
// ---------------------------------------------------------------------------
import { createChartController } from '@klinechart-quant/core'
__setControllerFactory(createChartController)

// Re-export the 7 controller-level composables from `./composables/`.
// Pair with the existing useChart + useIndicatorSelector to give every
// public controller in @klinechart-quant/core an idiomatic Vue 3 binding.
export {
    useAlerts,
    useReplay,
    useFootprint,
    useVolumeProfile,
    useAnchoredVwap,
    useOrderBookHeatmap,
    useMtfOverlay,
} from './composables'

export type {
    UseAlertsOpts,
    UseAlertsResult,
} from './composables/useAlerts'
export type {
    UseReplayOpts,
    UseReplayResult,
} from './composables/useReplay'
export type {
    UseFootprintOpts,
    UseFootprintResult,
} from './composables/useFootprint'
export type {
    UseVolumeProfileOpts,
    UseVolumeProfileResult,
} from './composables/useVolumeProfile'
export type {
    UseAnchoredVwapOpts,
    UseAnchoredVwapResult,
} from './composables/useAnchoredVwap'
export type {
    UseOrderBookHeatmapOpts,
    UseOrderBookHeatmapResult,
} from './composables/useOrderBookHeatmap'
export type {
    UseMtfOverlayOpts,
    UseMtfOverlayResult,
} from './composables/useMtfOverlay'
