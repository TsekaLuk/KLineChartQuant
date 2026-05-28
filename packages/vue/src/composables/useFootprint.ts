import { onScopeDispose, shallowRef, type Ref } from 'vue'
import {
    createFootprintController,
    type FootprintBar,
    type FootprintConfig,
    type FootprintController,
    type TradeWithFlag,
} from '@klinechart-quant/core'

export interface UseFootprintOpts {
    config: FootprintConfig
    controller?: FootprintController
}

export interface UseFootprintResult {
    bars: Ref<ReadonlyArray<FootprintBar>>
    cumulativeDelta: Ref<ReadonlyArray<number>>
    /** Canonical verb (matches FootprintController.ingest). */
    ingest(trade: TradeWithFlag, bid?: number, ask?: number): void
    /** @deprecated since 0.1.0-alpha.1 — use {@link UseFootprintResult.ingest}. */
    ingestTrade(trade: TradeWithFlag, bid?: number, ask?: number): void
    setConfig(next: Partial<FootprintConfig>): void
    reset(): void
}

export function useFootprint(opts: UseFootprintOpts): UseFootprintResult {
    const c = opts.controller ?? createFootprintController(opts.config)
    const ownsController = opts.controller === undefined

    const bars = shallowRef<ReadonlyArray<FootprintBar>>(c.bars.peek())
    const cumulativeDelta = shallowRef<ReadonlyArray<number>>(c.cumulativeDelta.peek())
    const stopBars = c.bars.subscribe(() => {
        bars.value = c.bars()
    })
    const stopCvd = c.cumulativeDelta.subscribe(() => {
        cumulativeDelta.value = c.cumulativeDelta()
    })

    onScopeDispose(() => {
        stopBars()
        stopCvd()
        if (ownsController) c.dispose()
    })

    return {
        bars,
        cumulativeDelta,
        ingest: c.ingest.bind(c),
        ingestTrade: c.ingestTrade.bind(c),
        setConfig: c.setConfig.bind(c),
        reset: c.reset.bind(c),
    }
}
