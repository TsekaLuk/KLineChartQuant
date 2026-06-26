import { KLineChartError } from '@klinechart-quant/core'
/**
 * @klinechart-quant/react — public API surface.
 *
 * React 18/19 bindings that bridge zero-dep core signals to React rendering
 * via `useSyncExternalStore`. SSR-safe: no DOM access at module scope.
 *
 * **Production users do NOT need to register a factory.** The production
 * `createChartController` from `@klinechart-quant/core` is auto-registered
 * at the bottom of this module — `useChart` / `<KLineChart>` work out of
 * the box. The `__setChartFactory` export exists ONLY so tests can inject a
 * mock controller in `beforeEach` and reset in `afterEach`; the double
 * underscore is the universal "internal but not literally private" signal.
 */

import {
    createElement,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react'
import type { CSSProperties, FC, RefObject } from 'react'
import type {
    ChartController,
    ChartControllerFactory,
    ChartMountOptions,
    IndicatorSelectorController,
} from '@klinechart-quant/core'

export type {
    ChartController,
    ChartMountOptions,
    IndicatorSelectorController,
} from '@klinechart-quant/core'

// ---------------------------------------------------------------------------
// Factory registry — allows tests / consumers to inject the concrete
// controller without forcing this package to depend on the production
// implementation (which lives in @klinechart-quant/core/controllers).
// ---------------------------------------------------------------------------

let chartFactory: ChartControllerFactory | null = null

/**
 * Register the production ChartControllerFactory. Called by the consumer
 * (or by the core package during its module init in a later phase).
 *
 * Exposed for tests under a `__` prefix to signal "internal but accessible".
 */
export function __setChartFactory(factory: ChartControllerFactory | null): void {
    chartFactory = factory
}

function resolveFactory(): ChartControllerFactory {
    if (chartFactory === null) {
        throw new KLineChartError(
            'CONTROLLER_CONFIG_INVALID',
            '[@klinechart-quant/react] No ChartControllerFactory registered. ' +
                'Call __setChartFactory(factory) before mounting, or import the ' +
                'production factory from @klinechart-quant/core/controllers.',
        )
    }
    return chartFactory
}

// ---------------------------------------------------------------------------
// createChart — imperative mount
// ---------------------------------------------------------------------------

/**
 * Imperative mount API. Returns a controller; caller is responsible for `dispose`.
 *
 * Throws synchronously if `opts.container` is null/undefined — the only valid
 * entry path is with a real DOM element. This guards against half-mounts in
 * SSR contexts that accidentally invoke the function.
 */
export function createChart(opts: ChartMountOptions): ChartController {
    if (opts === null || opts === undefined) {
        throw new KLineChartError('CONTROLLER_CONFIG_INVALID', '[@klinechart-quant/react] createChart: opts is required')
    }
    if (opts.container === null || opts.container === undefined) {
        throw new KLineChartError(
            'CONTROLLER_CONFIG_INVALID',
            '[@klinechart-quant/react] createChart: opts.container must be a non-null HTMLElement',
        )
    }
    const factory = resolveFactory()
    return factory(opts)
}

// ---------------------------------------------------------------------------
// useChart — React lifecycle wrapper around createChart
// ---------------------------------------------------------------------------

/**
 * React hook: mounts on first render to the ref'd element, returns the controller.
 *
 * Behaviour:
 * - Returns `null` until `ref.current` is populated (covers SSR + first render
 *   before commit). Mount is deferred to `useEffect` so DOM is touched only
 *   in the browser, never during SSR.
 * - Re-renders the host component when subscribed signals change, via
 *   `useSyncExternalStore`.
 * - Disposes the controller (and unmounts) when the host component unmounts.
 *
 * SSR contract: this function is safe to call from server-rendered components.
 * It returns `null` on the server because `useEffect` does not run there.
 */
export function useChart(
    ref: RefObject<HTMLElement | null>,
    opts: Omit<ChartMountOptions, 'container'>,
): ChartController | null {
    const [controller, setController] = useState<ChartController | null>(null)

    // Snapshot opts so the effect does not retrigger on every render. Tests and
    // call sites that need to push new data should use `controller.setData(...)`.
    const optsRef = useRef(opts)
    optsRef.current = opts

    useEffect(() => {
        const container = ref.current
        if (container === null || container === undefined) {
            return
        }
        const created = createChart({
            ...optsRef.current,
            container,
        })
        setController(created)
        return () => {
            setController(null)
            created.dispose()
        }
        // ref is an object whose identity is stable across renders; we
        // intentionally re-mount only when the ref *object* changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref])

    return controller
}

// ---------------------------------------------------------------------------
// useIndicatorSelector — subscribe to indicator selector signals
// ---------------------------------------------------------------------------

type IndicatorSelectorView = {
    catalog: ReturnType<IndicatorSelectorController['catalog']>
    active: ReturnType<IndicatorSelectorController['active']>
    add: IndicatorSelectorController['add']
    remove: IndicatorSelectorController['remove']
}

/**
 * Subscribes to `controller.indicatorSelector.catalog` and `.active` via
 * `useSyncExternalStore` (tearing-safe in concurrent React).
 *
 * Returns the current snapshots plus the mutation methods.
 */
export function useIndicatorSelector(controller: ChartController): IndicatorSelectorView {
    const selector = controller.indicatorSelector

    // Subscribe to BOTH signals through one combined subscription so React
    // sees a single store. Each call to the returned subscribe wires up two
    // unsub callbacks; both fire the same listener.
    const subscribe = useMemo(
        () => (cb: () => void) => {
            const u1 = selector.catalog.subscribe(cb)
            const u2 = selector.active.subscribe(cb)
            return () => {
                u1()
                u2()
            }
        },
        [selector],
    )

    // Snapshot must be stable when neither underlying signal has changed.
    // We cache the last tuple by reference so React's strict equality check
    // does not see a fresh object every render.
    const snapshotRef = useRef<{
        catalog: ReturnType<IndicatorSelectorController['catalog']>
        active: ReturnType<IndicatorSelectorController['active']>
        tuple: IndicatorSelectorView
    } | null>(null)

    const getSnapshot = useCallback((): IndicatorSelectorView => {
        const catalog = selector.catalog()
        const active = selector.active()
        const cached = snapshotRef.current
        if (
            cached !== null &&
            cached.catalog === catalog &&
            cached.active === active
        ) {
            return cached.tuple
        }
        const tuple: IndicatorSelectorView = {
            catalog,
            active,
            add: selector.add.bind(selector),
            remove: selector.remove.bind(selector),
        }
        snapshotRef.current = { catalog, active, tuple }
        return tuple
    }, [selector])

    // SSR fallback: read the current value without subscribing. Safe because
    // signals are in-memory data and do not touch DOM.
    const getServerSnapshot = getSnapshot

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// ---------------------------------------------------------------------------
// <KLineChart /> — convenience component
// ---------------------------------------------------------------------------

export interface KLineChartProps {
    data: ChartMountOptions['data']
    initialZoomLevel?: number
    theme?: 'light' | 'dark'
    className?: string
    style?: CSSProperties
    /**
     * Controlled fullscreen input. When it transitions to `true` the host
     * element requests browser fullscreen; transitioning to `false` exits it.
     * Defaults to `false`.
     */
    fullscreen?: boolean
    /**
     * Reflects browser-driven fullscreen changes (user pressing Esc / F11).
     * Keeps the consumer's bound state in sync; mirror it back into the
     * `fullscreen` prop for two-way binding.
     */
    onFullscreenChange?: (v: boolean) => void
}

/**
 * Convenience component. Renders a host div, mounts a chart into it via
 * `useChart`, and forwards `className` / `style`.
 *
 * Owns browser Fullscreen handling on its existing root host element: the
 * controlled `fullscreen` prop drives `requestFullscreen` / `exitFullscreen`,
 * and a `fullscreenchange` listener emits `onFullscreenChange` so consumers
 * never wire those up themselves.
 *
 * Consumers needing direct controller access should use `useChart` with their
 * own ref instead.
 */
export const KLineChart: FC<KLineChartProps> = ({
    data,
    initialZoomLevel,
    theme,
    className,
    style,
    fullscreen = false,
    onFullscreenChange,
}) => {
    const ref = useRef<HTMLDivElement | null>(null)
    useChart(ref, { data, initialZoomLevel, theme })

    // Keep the latest callback in a ref so the mount-only listener effect does
    // not re-subscribe on every render when the consumer passes an inline fn.
    const onFullscreenChangeRef = useRef(onFullscreenChange)
    onFullscreenChangeRef.current = onFullscreenChange

    // Sync the controlled `fullscreen` input → browser fullscreen state on the
    // existing root host element. SSR-safe + jsdom-safe: every DOM access is
    // guarded, and the Fullscreen API methods may be absent.
    useEffect(() => {
        if (typeof document === 'undefined') {
            return
        }
        const rootElement = ref.current
        if (rootElement === null) {
            return
        }
        if (fullscreen) {
            if (
                document.fullscreenElement !== rootElement &&
                typeof rootElement.requestFullscreen === 'function'
            ) {
                void rootElement.requestFullscreen()
            }
        } else if (
            document.fullscreenElement !== null &&
            typeof document.exitFullscreen === 'function'
        ) {
            void document.exitFullscreen()
        }
    }, [fullscreen])

    // Subscribe to browser-driven fullscreen changes once on mount; emit the
    // new boolean derived from whether the root host element is fullscreen.
    // Listener is removed on unmount so nothing leaks.
    useEffect(() => {
        if (typeof document === 'undefined') {
            return
        }
        const handleFullscreenChange = (): void => {
            const rootElement = ref.current
            const isFullscreen = document.fullscreenElement === rootElement
            const emit = onFullscreenChangeRef.current
            if (emit !== undefined) {
                emit(isFullscreen)
            }
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
        }
    }, [])

    return createElement('div', { ref, className, style })
}

// ---------------------------------------------------------------------------
// Auto-register the production ChartControllerFactory
//
// Consumers don't need to call __setChartFactory manually unless they want
// to inject a custom backing (e.g. for testing). The contract tests in this
// package override the factory in `beforeEach` and reset to null in
// `afterEach`, so this default registration is transparent to them.
//
// Importing the factory is side-effect-free at module load — the engine's
// DOM access only happens when `createChart(opts)` is actually called.
// ---------------------------------------------------------------------------
import { createChartController } from '@klinechart-quant/core'
__setChartFactory(createChartController)

// Re-export the 7 controller-level hooks from `./hooks/`. These pair with
// the existing useChart + useIndicatorSelector to give every public
// controller in @klinechart-quant/core an idiomatic React binding.
export {
    useAlerts,
    useReplay,
    useFootprint,
    useVolumeProfile,
    useAnchoredVwap,
    useOrderBookHeatmap,
    useMtfOverlay,
} from './hooks'

export type {
    UseAlertsOpts,
    UseAlertsResult,
} from './hooks/useAlerts'
export type {
    UseReplayOpts,
    UseReplayResult,
} from './hooks/useReplay'
export type {
    UseFootprintOpts,
    UseFootprintResult,
} from './hooks/useFootprint'
export type {
    UseVolumeProfileOpts,
    UseVolumeProfileResult,
} from './hooks/useVolumeProfile'
export type {
    UseAnchoredVwapOpts,
    UseAnchoredVwapResult,
} from './hooks/useAnchoredVwap'
export type {
    UseOrderBookHeatmapOpts,
    UseOrderBookHeatmapResult,
} from './hooks/useOrderBookHeatmap'
export type {
    UseMtfOverlayOpts,
    UseMtfOverlayResult,
} from './hooks/useMtfOverlay'
