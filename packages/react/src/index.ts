/**
 * @klinechart-quant/react — public API surface.
 *
 * React 18/19 bindings that bridge zero-dep core signals to React rendering
 * via `useSyncExternalStore`. SSR-safe: no DOM access at module scope.
 *
 * Pluggable factory: tests inject a mock controller via `__setChartFactory`.
 * Production builds will register the real factory from
 * `@klinechart-quant/core/controllers/createChartController` (Phase 1 deliverable).
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
        throw new Error(
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
        throw new Error('[@klinechart-quant/react] createChart: opts is required')
    }
    if (opts.container === null || opts.container === undefined) {
        throw new Error(
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
}

/**
 * Convenience component. Renders a host div, mounts a chart into it via
 * `useChart`, and forwards `className` / `style`.
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
}) => {
    const ref = useRef<HTMLDivElement | null>(null)
    useChart(ref, { data, initialZoomLevel, theme })
    return createElement('div', { ref, className, style })
}
