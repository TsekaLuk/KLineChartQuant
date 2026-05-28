import { onScopeDispose, shallowRef, type Ref } from 'vue'
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
    latestSnapshot: Ref<BookSnapshot | null>
    snapshotCount: Ref<number>
    deltaCount: Ref<number>
    /** Canonical verb (matches HeatmapController.ingest). */
    ingest(delta: OrderBookDelta): void
    /** @deprecated since 0.1.0-alpha.1 — use {@link UseOrderBookHeatmapResult.ingest}. */
    ingestDelta(delta: OrderBookDelta): void
    forceSnapshot(): void
    replay(from: number, to: number, intervalMs: number): ReadonlyArray<BookSnapshot>
    setConfig(next: Partial<HeatmapControllerConfig>): void
}

export function useOrderBookHeatmap(opts: UseOrderBookHeatmapOpts): UseOrderBookHeatmapResult {
    const c = opts.controller ?? createHeatmapController(opts.config)
    const ownsController = opts.controller === undefined

    const initial = c.state.peek()
    const latestSnapshot = shallowRef<BookSnapshot | null>(initial.latestSnapshot)
    const snapshotCount = shallowRef<number>(initial.snapshotCount)
    const deltaCount = shallowRef<number>(initial.deltaCount)

    const stop = c.state.subscribe(() => {
        const s = c.state()
        latestSnapshot.value = s.latestSnapshot
        snapshotCount.value = s.snapshotCount
        deltaCount.value = s.deltaCount
    })

    onScopeDispose(() => {
        stop()
        if (ownsController) c.dispose()
    })

    return {
        latestSnapshot,
        snapshotCount,
        deltaCount,
        ingest: c.ingest.bind(c),
        ingestDelta: c.ingestDelta.bind(c),
        forceSnapshot: c.forceSnapshot.bind(c),
        replay: c.replay.bind(c),
        setConfig: c.setConfig.bind(c),
    }
}
