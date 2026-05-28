/**
 * @klinechart-quant/angular — public API surface.
 *
 * Implementations are stubs that throw. Phase 1C agent fills these in
 * to make src/__tests__/contract.test.ts pass.
 */

import type {
    ChartController,
    ChartMountOptions,
} from '@klinechart-quant/core'

export type { ChartController, ChartMountOptions } from '@klinechart-quant/core'

/**
 * Standalone <kline-chart> component.
 * Inputs: data, theme, initialZoomLevel.
 * OnPush change detection driven by toSignal(core signal).
 *
 * Phase 1C agent: replace this stub with an @Component-decorated class.
 */
export const KLineChartComponent: unknown = (() => {
    throw new Error('KLineChartComponent not yet implemented — Phase 1C')
})

/**
 * DI provider factory.
 * Usage: providers: [provideKLineChart({ theme: 'dark' })]
 */
export function provideKLineChart(_opts: { theme?: 'light' | 'dark' } = {}): unknown[] {
    throw new Error('provideKLineChart not yet implemented — Phase 1C')
}

/**
 * Imperative escape hatch — same shape as React/Vue createChart.
 */
export function createChart(_opts: ChartMountOptions): ChartController {
    throw new Error('createChart not yet implemented — Phase 1C')
}
