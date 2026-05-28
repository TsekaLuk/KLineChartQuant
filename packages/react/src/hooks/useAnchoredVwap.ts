import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
    createAnchoredVwapController,
    type ActiveAnchor,
    type AnchorDefinition,
    type AnchoredVwapController,
    type AVWAPBar,
} from '@klinechart-quant/core'

export interface UseAnchoredVwapOpts {
    initialBars?: ReadonlyArray<AVWAPBar>
    controller?: AnchoredVwapController
}

export interface UseAnchoredVwapResult {
    anchors: ReadonlyArray<ActiveAnchor>
    setBars(bars: ReadonlyArray<AVWAPBar>): void
    addAnchor(def: AnchorDefinition): string
    removeAnchor(id: string): boolean
    updateAnchor(id: string, patch: Partial<Omit<AnchorDefinition, 'id'>>): boolean
    appendBar(bar: AVWAPBar): void
}

export function useAnchoredVwap(opts: UseAnchoredVwapOpts = {}): UseAnchoredVwapResult {
    const controllerRef = useRef<AnchoredVwapController | null>(opts.controller ?? null)
    if (controllerRef.current === null) {
        const init: { initialBars?: ReadonlyArray<AVWAPBar> } = {}
        if (opts.initialBars !== undefined) init.initialBars = opts.initialBars
        controllerRef.current = createAnchoredVwapController(init)
    }
    const c = controllerRef.current

    useEffect(() => {
        const ctl = controllerRef.current
        return () => {
            if (opts.controller === undefined && ctl !== null) ctl.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const subscribe = useMemo(() => (cb: () => void) => c.anchors.subscribe(cb), [c])
    const getSnapshot = useCallback(() => c.anchors(), [c])
    const anchors = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return {
        anchors,
        setBars: c.setBars.bind(c),
        addAnchor: c.addAnchor.bind(c),
        removeAnchor: c.removeAnchor.bind(c),
        updateAnchor: c.updateAnchor.bind(c),
        appendBar: c.appendBar.bind(c),
    }
}
