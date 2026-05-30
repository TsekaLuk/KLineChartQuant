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
    IndicatorInstance,
    InteractionSnapshot,
} from '@klinechart-quant/core'

export type {
    ChartController,
    ChartMountOptions,
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
// useIndicators — subscribe to controller indicators signal
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

    const getSnapshot = useCallback((): IndicatorsView => ({
        indicators: indicators(),
        add: controller.addIndicator.bind(controller),
        remove: controller.removeIndicator.bind(controller),
        updateParams: controller.updateIndicatorParams.bind(controller),
    }), [indicators, controller])

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
