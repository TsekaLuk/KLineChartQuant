import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
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
    series: ReadonlyArray<ActiveMtfSeries>
    setBaseBars(bars: ReadonlyArray<BaseBar>, intervalMs: number): void
    addSeries(def: MtfSeriesDefinition): string
    removeSeries(id: string): boolean
    updateSeries(id: string, patch: Partial<Omit<MtfSeriesDefinition, 'id'>>): boolean
    appendBaseBar(bar: BaseBar): void
}

export function useMtfOverlay(opts: UseMtfOverlayOpts = {}): UseMtfOverlayResult {
    const controllerRef = useRef<MtfController | null>(opts.controller ?? null)
    if (controllerRef.current === null) {
        const init: { initialBars?: ReadonlyArray<BaseBar>; baseIntervalMs?: number } = {}
        if (opts.initialBars !== undefined) init.initialBars = opts.initialBars
        if (opts.baseIntervalMs !== undefined) init.baseIntervalMs = opts.baseIntervalMs
        controllerRef.current = createMtfController(init)
    }
    const c = controllerRef.current

    useEffect(() => {
        const ctl = controllerRef.current
        return () => {
            if (opts.controller === undefined && ctl !== null) ctl.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const subscribe = useMemo(() => (cb: () => void) => c.series.subscribe(cb), [c])
    const getSnapshot = useCallback(() => c.series(), [c])
    const series = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return {
        series,
        setBaseBars: c.setBaseBars.bind(c),
        addSeries: c.addSeries.bind(c),
        removeSeries: c.removeSeries.bind(c),
        updateSeries: c.updateSeries.bind(c),
        appendBaseBar: c.appendBaseBar.bind(c),
    }
}
