import { onScopeDispose, shallowRef, type Ref } from 'vue'
import {
    createMtfController,
    type ActiveMtfSeries,
    type BaseBar,
    type MtfController,
    type MtfSeriesDefinition,
} from '@klinechart-quant/core'

export interface UseMtfOverlayOpts {
    initialBars?: ReadonlyArray<BaseBar>
    baseIntervalMs?: number
    controller?: MtfController
}

export interface UseMtfOverlayResult {
    series: Ref<ReadonlyArray<ActiveMtfSeries>>
    setBaseBars(bars: ReadonlyArray<BaseBar>, intervalMs: number): void
    addSeries(def: MtfSeriesDefinition): string
    removeSeries(id: string): boolean
    updateSeries(id: string, patch: Partial<Omit<MtfSeriesDefinition, 'id'>>): boolean
    appendBaseBar(bar: BaseBar): void
}

export function useMtfOverlay(opts: UseMtfOverlayOpts = {}): UseMtfOverlayResult {
    const initOpts: { initialBars?: ReadonlyArray<BaseBar>; baseIntervalMs?: number } = {}
    if (opts.initialBars !== undefined) initOpts.initialBars = opts.initialBars
    if (opts.baseIntervalMs !== undefined) initOpts.baseIntervalMs = opts.baseIntervalMs
    const c = opts.controller ?? createMtfController(initOpts)
    const ownsController = opts.controller === undefined

    const series = shallowRef<ReadonlyArray<ActiveMtfSeries>>(c.series.peek())
    const stop = c.series.subscribe(() => {
        series.value = c.series()
    })

    onScopeDispose(() => {
        stop()
        if (ownsController) c.dispose()
    })

    return {
        series,
        setBaseBars: c.setBaseBars.bind(c),
        addSeries: c.addSeries.bind(c),
        removeSeries: c.removeSeries.bind(c),
        updateSeries: c.updateSeries.bind(c),
        appendBaseBar: c.appendBaseBar.bind(c),
    }
}
