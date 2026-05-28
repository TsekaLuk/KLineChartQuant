/**
 * @klinechart-quant/vue — public API surface.
 *
 * Implementations are stubs that throw. Phase 1D agent fills these in
 * to make src/__tests__/contract.test.ts pass.
 *
 * Backward-compatibility contract: a `KMapPlugin.install(app)` export MUST exist
 * so existing users of the legacy `@363045841yyt/klinechart` (which currently
 * lives at repo root and re-exports `KLineChart`) continue to work after we
 * point the root export at this package.
 */

import type {
    ChartController,
    ChartMountOptions,
    IndicatorSelectorController,
} from '@klinechart-quant/core'
import type { App, Ref } from 'vue'

export type { ChartController, ChartMountOptions, IndicatorSelectorController } from '@klinechart-quant/core'

export function createChart(_opts: ChartMountOptions): ChartController {
    throw new Error('createChart not yet implemented — Phase 1D')
}

/**
 * Composable. Pass a template ref to the container element.
 * Returns reactive bindings backed by Vue's shallowRef + effect bridging
 * @klinechart-quant/core signals.
 */
export function useChart(
    _containerRef: Ref<HTMLElement | null>,
    _opts: Omit<ChartMountOptions, 'container'>,
): {
    chart: Ref<ChartController | null>
} {
    throw new Error('useChart not yet implemented — Phase 1D')
}

export function useIndicatorSelector(
    _controller: ChartController,
): {
    catalog: Ref<ReturnType<IndicatorSelectorController['catalog']>>
    active: Ref<ReturnType<IndicatorSelectorController['active']>>
    add: IndicatorSelectorController['add']
    remove: IndicatorSelectorController['remove']
} {
    throw new Error('useIndicatorSelector not yet implemented — Phase 1D')
}

/**
 * <KLineChart /> SFC. Mirrors props of the legacy src/components/KLineChart.vue
 * for drop-in compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KLineChart: any = {
    name: 'KLineChart',
    setup() {
        throw new Error('<KLineChart /> not yet implemented — Phase 1D')
    },
}

/**
 * Vue plugin — preserves legacy install signature.
 *   app.use(KMapPlugin)  // registers global <KLineChart />
 */
export const KMapPlugin = {
    install(app: App) {
        app.component('KLineChart', KLineChart)
    },
}
