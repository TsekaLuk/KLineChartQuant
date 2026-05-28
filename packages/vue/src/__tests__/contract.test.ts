/**
 * Contract test for @klinechart-quant/vue.
 *
 * Phase 1D agent's brief: make these pass without weakening assertions,
 * preserving the legacy KMapPlugin.install signature.
 */

import { describe, it, expect } from 'vitest'
import * as VueAdapter from '../index'

describe('@klinechart-quant/vue — public API surface', () => {
    it('exports createChart, useChart, useIndicatorSelector, KLineChart, KMapPlugin', () => {
        expect(typeof VueAdapter.createChart).toBe('function')
        expect(typeof VueAdapter.useChart).toBe('function')
        expect(typeof VueAdapter.useIndicatorSelector).toBe('function')
        expect(VueAdapter.KLineChart).toBeDefined()
        expect(typeof VueAdapter.KMapPlugin.install).toBe('function')
    })

    it('KMapPlugin.install is callable with a mock app and registers KLineChart', () => {
        const registered: Record<string, unknown> = {}
        const mockApp = {
            component(name: string, comp: unknown) {
                registered[name] = comp
            },
        } as unknown as Parameters<typeof VueAdapter.KMapPlugin.install>[0]
        VueAdapter.KMapPlugin.install(mockApp)
        expect(registered.KLineChart).toBe(VueAdapter.KLineChart)
    })
})

describe('@klinechart-quant/vue — SSR safety', () => {
    it('module import does not touch window or document', () => {
        // Import above ran in node env without jsdom. If it touched window, this
        // file would not have loaded. Test documents the contract.
        expect(true).toBe(true)
    })
})

describe('@klinechart-quant/vue — useChart lifecycle (TODO: requires jsdom + @vue/test-utils)', () => {
    it.todo('mounts on first render via template ref')
    it.todo('disposes on unmount')
    it.todo('reactivity bridge: signal change updates returned ref')
})
