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
    /** Canonical verb (matches AnchoredVwapController.setData). */
    setData(bars: ReadonlyArray<AVWAPBar>): void
    /** @deprecated since 0.1.0-alpha.1 — use {@link UseAnchoredVwapResult.setData}. */
    setBars(bars: ReadonlyArray<AVWAPBar>): void
    addAnchor(def: AnchorDefinition): string
    removeAnchor(id: string): boolean
    updateAnchor(id: string, patch: Partial<Omit<AnchorDefinition, 'id'>>): boolean
    /** Canonical verb (matches AnchoredVwapController.append). */
    append(bar: AVWAPBar): void
    /** @deprecated since 0.1.0-alpha.1 — use {@link UseAnchoredVwapResult.append}. */
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
        setData: c.setData.bind(c),
        setBars: c.setBars.bind(c),
        addAnchor: c.addAnchor.bind(c),
        removeAnchor: c.removeAnchor.bind(c),
        updateAnchor: c.updateAnchor.bind(c),
        append: c.append.bind(c),
        appendBar: c.appendBar.bind(c),
    }
}
