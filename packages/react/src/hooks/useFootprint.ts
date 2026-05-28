import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
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
    bars: ReadonlyArray<FootprintBar>
    cumulativeDelta: ReadonlyArray<number>
    ingestTrade(trade: TradeWithFlag, bid?: number, ask?: number): void
    setConfig(next: Partial<FootprintConfig>): void
    reset(): void
}

export function useFootprint(opts: UseFootprintOpts): UseFootprintResult {
    const controllerRef = useRef<FootprintController | null>(opts.controller ?? null)
    if (controllerRef.current === null) {
        controllerRef.current = createFootprintController(opts.config)
    }
    const c = controllerRef.current

    useEffect(() => {
        const ctl = controllerRef.current
        return () => {
            if (opts.controller === undefined && ctl !== null) ctl.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const subscribeBars = useMemo(() => (cb: () => void) => c.bars.subscribe(cb), [c])
    const getBarsSnapshot = useCallback(() => c.bars(), [c])
    const bars = useSyncExternalStore(subscribeBars, getBarsSnapshot, getBarsSnapshot)

    const subscribeCvd = useMemo(() => (cb: () => void) => c.cumulativeDelta.subscribe(cb), [c])
    const getCvdSnapshot = useCallback(() => c.cumulativeDelta(), [c])
    const cumulativeDelta = useSyncExternalStore(subscribeCvd, getCvdSnapshot, getCvdSnapshot)

    return {
        bars,
        cumulativeDelta,
        ingestTrade: c.ingestTrade.bind(c),
        setConfig: c.setConfig.bind(c),
        reset: c.reset.bind(c),
    }
}
