import { onScopeDispose, shallowRef, type Ref } from 'vue'
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
    anchors: Ref<ReadonlyArray<ActiveAnchor>>
    setBars(bars: ReadonlyArray<AVWAPBar>): void
    addAnchor(def: AnchorDefinition): string
    removeAnchor(id: string): boolean
    updateAnchor(id: string, patch: Partial<Omit<AnchorDefinition, 'id'>>): boolean
    appendBar(bar: AVWAPBar): void
}

export function useAnchoredVwap(opts: UseAnchoredVwapOpts = {}): UseAnchoredVwapResult {
    const initOpts: { initialBars?: ReadonlyArray<AVWAPBar> } = {}
    if (opts.initialBars !== undefined) initOpts.initialBars = opts.initialBars
    const c = opts.controller ?? createAnchoredVwapController(initOpts)
    const ownsController = opts.controller === undefined

    const anchors = shallowRef<ReadonlyArray<ActiveAnchor>>(c.anchors.peek())
    const stop = c.anchors.subscribe(() => {
        anchors.value = c.anchors()
    })

    onScopeDispose(() => {
        stop()
        if (ownsController) c.dispose()
    })

    return {
        anchors,
        setBars: c.setBars.bind(c),
        addAnchor: c.addAnchor.bind(c),
        removeAnchor: c.removeAnchor.bind(c),
        updateAnchor: c.updateAnchor.bind(c),
        appendBar: c.appendBar.bind(c),
    }
}
