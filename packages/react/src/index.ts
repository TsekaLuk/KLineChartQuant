/**
 * @363045841yyt/klinechart-react â€?public API surface.
 *
 * React 18/19 bindings that bridge zero-dep core signals to React rendering
 * via `useSyncExternalStore`. SSR-safe: no DOM access at module scope.
 *
 * Pluggable factory: tests inject a mock controller via `__setChartFactory`.
 * Production builds will register the real factory from
 * `@363045841yyt/klinechart-core/controllers/createChartController` (Phase 1 deliverable).
 */

import {
    createElement,
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react'
import type { CSSProperties, ForwardedRef, FC, RefObject } from 'react'
import type {
    ChartController,
    ChartControllerFactory,
    ChartMountOptions,
    ChartViewport,
    IndicatorInstance,
    InteractionSnapshot,
    KLineData,
    DrawingControllerCallbacks,
} from '@363045841yyt/klinechart-core'

export type {
    ChartController,
    ChartMountOptions,
    ChartViewport,
} from '@363045841yyt/klinechart-core'

// ---------------------------------------------------------------------------
// Factory registry â€?allows tests / consumers to inject the concrete
// controller without forcing this package to depend on the production
// implementation (which lives in @363045841yyt/klinechart-core/controllers).
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
            '[@363045841yyt/klinechart-react] No ChartControllerFactory registered. ' +
                'Call __setChartFactory(factory) before mounting, or import the ' +
                'production factory from @363045841yyt/klinechart-core/controllers.',
        )
    }
    return chartFactory
}

// ---------------------------------------------------------------------------
// createChart â€?imperative mount
// ---------------------------------------------------------------------------

/**
 * Imperative mount API. Returns a controller; caller is responsible for `dispose`.
 *
 * Throws synchronously if `opts.container` is null/undefined â€?the only valid
 * entry path is with a real DOM element. This guards against half-mounts in
 * SSR contexts that accidentally invoke the function.
 */
export function createChart(opts: ChartMountOptions): ChartController {
    if (opts === null || opts === undefined) {
        throw new Error('[@363045841yyt/klinechart-react] createChart: opts is required')
    }
    if (opts.container === null || opts.container === undefined) {
        throw new Error(
            '[@363045841yyt/klinechart-react] createChart: opts.container must be a non-null HTMLElement',
        )
    }
    const factory = resolveFactory()
    return factory(opts)
}

// ---------------------------------------------------------------------------
// useChart â€?React lifecycle wrapper around createChart
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
// useIndicators â€?subscribe to controller indicators signal
// ---------------------------------------------------------------------------

type IndicatorsView = {
    indicators: ReadonlyArray<IndicatorInstance>
    add: ChartController['addIndicator']
    remove: ChartController['removeIndicator']
    updateParams: ChartController['updateIndicatorParams']
}

/**
 * Subscribes to `controller.indicators` via `useSyncExternalStore`.
 */
export function useIndicators(controller: ChartController): IndicatorsView {
    const indicators = controller.indicators

    const subscribe = useCallback(
        (cb: () => void) => indicators.subscribe(cb),
        [indicators],
    )

    const { getSnapshot } = useMemo(() => {
        let cached: IndicatorsView | null = null
        return {
            getSnapshot: (): IndicatorsView => {
                const next = indicators()
                if (cached !== null && cached.indicators === next) return cached
                cached = {
                    indicators: next,
                    add: controller.addIndicator.bind(controller),
                    remove: controller.removeIndicator.bind(controller),
                    updateParams: controller.updateIndicatorParams.bind(controller),
                }
                return cached
            },
        }
    }, [indicators, controller])

    const getServerSnapshot = getSnapshot

    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    return snapshot
}

/**
 * Subscribe to `controller.interactionState` via `useSyncExternalStore`.
 */
export function useInteractionState(
    controller: ChartController,
): InteractionSnapshot {
    const store = controller.interactionState

    const subscribe = useCallback(
        (cb: () => void) => store.subscribe(cb),
        [store],
    )

    const getSnapshot = useCallback(() => store(), [store])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Subscribe to `controller.paneRatios` via `useSyncExternalStore`.
 */
export function usePaneRatios(
    controller: ChartController,
): Readonly<Record<string, number>> {
    const store = controller.paneRatios

    const subscribe = useCallback(
        (cb: () => void) => store.subscribe(cb),
        [store],
    )

    const getSnapshot = useCallback(() => store(), [store])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Subscribe to `controller.viewport` via `useSyncExternalStore`.
 */
export function useViewport(
    controller: ChartController,
): ChartViewport {
    const store = controller.viewport

    const subscribe = useCallback(
        (cb: () => void) => store.subscribe(cb),
        [store],
    )

    const getSnapshot = useCallback(() => store(), [store])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// ---------------------------------------------------------------------------
// <KLineChart /> â€?convenience component
// ---------------------------------------------------------------------------

export interface KLineChartProps {
    data: ChartMountOptions['data']
    initialZoomLevel?: number
    theme?: 'light' | 'dark'
    zoomLevels?: number
    className?: string
    style?: CSSProperties
}

export interface KLineChartHandle {
    getController: () => ChartController | null
    handlePointerEvent: (e: PointerEvent, drawingController?: DrawingControllerCallbacks) => boolean
    handleWheelEvent: (e: WheelEvent) => void
    handleScrollEvent: () => void
    zoomToLevel: (level: number, anchorX?: number) => void
    zoomIn: (anchorX?: number) => void
    zoomOut: (anchorX?: number) => void
    addIndicator: (
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ) => string | null
    removeIndicator: (instanceId: string) => boolean
    setTheme: (theme: 'light' | 'dark') => void
    setData: (next: ReadonlyArray<KLineData>) => void
}

/**
 * Convenience component. Renders a host div, mounts a chart into it via
 * `useChart`, and forwards `className` / `style`.
 *
 * Supports `ref` for imperative controller access via `KLineChartHandle`.
 * Reacts to `data` and `theme` prop changes automatically.
 */
export const KLineChart = forwardRef<KLineChartHandle, KLineChartProps>(
    function KLineChart(
        { data, initialZoomLevel, theme, zoomLevels, className, style },
        ref: ForwardedRef<KLineChartHandle>,
    ) {
        const divRef = useRef<HTMLDivElement | null>(null)
        const controllerRef = useRef<ChartController | null>(null)

        useEffect(() => {
            const container = divRef.current
            if (container === null) return
            const created = createChart({
                container,
                data,
                initialZoomLevel,
                zoomLevels,
                theme,
            })
            controllerRef.current = created
            return () => {
                controllerRef.current = null
                created.dispose()
            }
            // Mount once â€?prop changes handled by separate effects
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        // React to data prop changes
        useEffect(() => {
            controllerRef.current?.setData(data)
        }, [data])

        // React to theme prop changes
        useEffect(() => {
            if (theme !== undefined) {
                controllerRef.current?.setTheme(theme)
            }
        }, [theme])

        useImperativeHandle(
            ref,
            (): KLineChartHandle => ({
                getController: (): ChartController | null => controllerRef.current,
                handlePointerEvent: (e, dc) =>
                    controllerRef.current?.handlePointerEvent(e, dc) ?? false,
                handleWheelEvent: (e) => controllerRef.current?.handleWheelEvent(e),
                handleScrollEvent: () => controllerRef.current?.handleScrollEvent(),
                zoomToLevel: (level, anchorX) =>
                    controllerRef.current?.zoomToLevel(level, anchorX),
                zoomIn: (anchorX) => controllerRef.current?.zoomIn(anchorX),
                zoomOut: (anchorX) => controllerRef.current?.zoomOut(anchorX),
                addIndicator: (id, role, params) =>
                    controllerRef.current?.addIndicator(id, role, params) ?? null,
                removeIndicator: (id) =>
                    controllerRef.current?.removeIndicator(id) ?? false,
                setTheme: (t) => controllerRef.current?.setTheme(t),
                setData: (next) => controllerRef.current?.setData(next),
            }),
            [],
        )

        return createElement('div', { ref: divRef, className, style })
    },
)

// ---------------------------------------------------------------------------
// Auto-register the production ChartControllerFactory
//
// Consumers don't need to call __setChartFactory manually unless they want
// to inject a custom backing (e.g. for testing). The contract tests in this
// package override the factory in `beforeEach` and reset to null in
// `afterEach`, so this default registration is transparent to them.
//
// Importing the factory is side-effect-free at module load â€?the engine's
// DOM access only happens when `createChart(opts)` is actually called.
// ---------------------------------------------------------------------------
import { createChartController } from '@363045841yyt/klinechart-core'
__setChartFactory(createChartController)
