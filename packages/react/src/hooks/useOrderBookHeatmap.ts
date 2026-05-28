import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
    createHeatmapController,
    type BookSnapshot,
    type HeatmapController,
    type HeatmapControllerConfig,
    type OrderBookDelta,
} from '@klinechart-quant/core'

export interface UseOrderBookHeatmapOpts {
    config: HeatmapControllerConfig
    controller?: HeatmapController
}

export interface UseOrderBookHeatmapResult {
    latestSnapshot: BookSnapshot | null
    snapshotCount: number
    deltaCount: number
    ingestDelta(delta: OrderBookDelta): void
    forceSnapshot(): void
    replay(from: number, to: number, intervalMs: number): ReadonlyArray<BookSnapshot>
    setConfig(next: Partial<HeatmapControllerConfig>): void
}

export function useOrderBookHeatmap(opts: UseOrderBookHeatmapOpts): UseOrderBookHeatmapResult {
    const controllerRef = useRef<HeatmapController | null>(opts.controller ?? null)
    if (controllerRef.current === null) {
        controllerRef.current = createHeatmapController(opts.config)
    }
    const c = controllerRef.current

    useEffect(() => {
        const ctl = controllerRef.current
        return () => {
            if (opts.controller === undefined && ctl !== null) ctl.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const subscribe = useMemo(() => (cb: () => void) => c.state.subscribe(cb), [c])
    const getSnapshot = useCallback(() => c.state(), [c])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return {
        latestSnapshot: state.latestSnapshot,
        snapshotCount: state.snapshotCount,
        deltaCount: state.deltaCount,
        ingestDelta: c.ingestDelta.bind(c),
        forceSnapshot: c.forceSnapshot.bind(c),
        replay: c.replay.bind(c),
        setConfig: c.setConfig.bind(c),
    }
}
