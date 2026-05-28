/**
 * @klinechart-quant/react — public API surface.
 *
 * Implementations are stubs that throw. Phase 1B agent fills these in
 * to make src/__tests__/contract.test.tsx pass.
 */

import type {
    ChartController,
    ChartMountOptions,
    IndicatorSelectorController,
} from '@klinechart-quant/core'

export type { ChartController, ChartMountOptions, IndicatorSelectorController } from '@klinechart-quant/core'

/**
 * Imperative mount API. Returns a controller; caller is responsible for `dispose`.
 * SSR contract: this function MUST NOT be imported at module top level by a
 * server component. Adapter exposes it only as a hook side effect.
 */
export function createChart(_opts: ChartMountOptions): ChartController {
    throw new Error('createChart not yet implemented — Phase 1B')
}

/**
 * React hook: mounts on first render to the ref'd element, returns the controller.
 * Re-renders the host component when any of the subscribed signals (viewport,
 * theme, active indicators) change, via useSyncExternalStore.
 *
 * SSR: returns null on the server; safe to call from RSC boundary.
 */
export function useChart(
    _ref: React.RefObject<HTMLElement | null>,
    _opts: Omit<ChartMountOptions, 'container'>,
): ChartController | null {
    throw new Error('useChart not yet implemented — Phase 1B')
}

/**
 * React hook over IndicatorSelectorController; subscribes to its signals.
 */
export function useIndicatorSelector(
    _controller: ChartController,
): {
    catalog: IndicatorSelectorController['catalog'] extends infer S
        ? S extends { (): infer T }
            ? T
            : never
        : never
    active: ReturnType<IndicatorSelectorController['active']>
    add: IndicatorSelectorController['add']
    remove: IndicatorSelectorController['remove']
} {
    throw new Error('useIndicatorSelector not yet implemented — Phase 1B')
}

/**
 * <KLineChart data={...} /> component. Internally wires container ref + useChart.
 */
export const KLineChart: React.FC<{
    data: ChartMountOptions['data']
    initialZoomLevel?: number
    theme?: 'light' | 'dark'
    className?: string
    style?: React.CSSProperties
}> = () => {
    throw new Error('<KLineChart /> not yet implemented — Phase 1B')
}
