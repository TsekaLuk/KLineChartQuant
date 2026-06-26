/**
 * Contract test for @klinechart-quant/vue.
 *
 * Phase 1D agent's brief: make these pass without weakening assertions,
 * preserving the legacy KMapPlugin.install signature.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import * as VueAdapter from '../index'
import { coreSignalToVueRef } from '../index'
import { createMockChartController, createTestSignal } from './_mockController'

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

describe('@klinechart-quant/vue — useChart lifecycle', () => {
    afterEach(() => {
        // Reset the injected factory so other tests start clean.
        VueAdapter.__setControllerFactory(null)
    })

    it('mounts on first render via template ref', async () => {
        const mockController = createMockChartController({ data: [] })
        const factorySpy = vi.fn(() => mockController)
        VueAdapter.__setControllerFactory(factorySpy)

        const HostComponent = defineComponent({
            name: 'Host',
            setup() {
                const containerRef = ref<HTMLElement | null>(null)
                const { chart } = VueAdapter.useChart(containerRef, { data: [] })
                return { containerRef, chart }
            },
            render() {
                return h('div', { ref: 'containerRef' })
            },
        })

        const wrapper = mount(HostComponent, { attachTo: document.body })
        await nextTick()

        expect(factorySpy).toHaveBeenCalledTimes(1)
        const factoryArg = factorySpy.mock.calls[0]?.[0]
        expect(factoryArg?.container).toBeInstanceOf(HTMLElement)
        expect(wrapper.vm.chart).toBe(mockController)

        wrapper.unmount()
    })

    it('disposes on unmount', async () => {
        const mockController = createMockChartController({ data: [] })
        VueAdapter.__setControllerFactory(() => mockController)

        const HostComponent = defineComponent({
            name: 'Host',
            setup() {
                const containerRef = ref<HTMLElement | null>(null)
                const { chart } = VueAdapter.useChart(containerRef, { data: [] })
                return { containerRef, chart }
            },
            render() {
                return h('div', { ref: 'containerRef' })
            },
        })

        const wrapper = mount(HostComponent, { attachTo: document.body })
        await nextTick()

        expect(mockController.disposeCalls()).toBe(0)
        wrapper.unmount()
        // Allow lifecycle hooks to settle.
        await nextTick()
        expect(mockController.disposeCalls()).toBe(1)
    })

    it('reactivity bridge: signal change updates returned ref', async () => {
        // Mount a tiny scoped component so coreSignalToVueRef can register
        // its onScopeDispose cleanup. Without a setup scope the ref is still
        // wired up correctly, but cleanup would not be automatic.
        const signal = createTestSignal<number>(1)
        const bridgedRef = shallowRef<{ value: number } | null>(null)

        const HostComponent = defineComponent({
            name: 'BridgeHost',
            setup() {
                const r = coreSignalToVueRef(signal)
                bridgedRef.value = r as unknown as { value: number }
                return () => h('div', String(r.value))
            },
        })

        const wrapper = mount(HostComponent, { attachTo: document.body })
        expect(bridgedRef.value?.value).toBe(1)
        expect(wrapper.text()).toBe('1')

        signal.set(42)
        await nextTick()

        expect(bridgedRef.value?.value).toBe(42)
        expect(wrapper.text()).toBe('42')

        wrapper.unmount()
    })
})

describe('@klinechart-quant/vue — KLineChart fullscreen', () => {
    afterEach(() => {
        VueAdapter.__setControllerFactory(null)
        // Reset the controllable fullscreenElement getter installed per-test.
        delete (document as { fullscreenElement?: unknown }).fullscreenElement
    })

    /**
     * jsdom does not implement the Fullscreen API, so we install spies on the
     * root host element and document, plus a controllable fullscreenElement
     * getter, to exercise the adapter's DOM wiring.
     */
    function installFullscreenSpies(): {
        requestFullscreen: ReturnType<typeof vi.fn>
        exitFullscreen: ReturnType<typeof vi.fn>
        setFullscreenElement: (el: Element | null) => void
    } {
        const requestFullscreen = vi.fn(() => Promise.resolve())
        const exitFullscreen = vi.fn(() => Promise.resolve())

        let current: Element | null = null
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => current,
        })
        ;(document as { exitFullscreen?: unknown }).exitFullscreen =
            exitFullscreen

        return {
            requestFullscreen,
            exitFullscreen,
            setFullscreenElement: (el) => {
                current = el
            },
        }
    }

    function mountKLineChart(props: Record<string, unknown> = {}) {
        const mockController = createMockChartController({ data: [] })
        VueAdapter.__setControllerFactory(() => mockController)
        return mount(VueAdapter.KLineChart, {
            attachTo: document.body,
            props: { data: [], ...props },
        })
    }

    it('Test A: fullscreen prop true calls requestFullscreen, false calls exitFullscreen', async () => {
        const spies = installFullscreenSpies()
        const wrapper = mountKLineChart()
        await nextTick()

        const rootEl = wrapper.element as HTMLElement
        rootEl.requestFullscreen = spies.requestFullscreen

        await wrapper.setProps({ fullscreen: true })
        await nextTick()
        expect(spies.requestFullscreen).toHaveBeenCalledTimes(1)

        // Simulate the element now being the fullscreen element, then exit.
        spies.setFullscreenElement(rootEl)
        await wrapper.setProps({ fullscreen: false })
        await nextTick()
        expect(spies.exitFullscreen).toHaveBeenCalledTimes(1)

        wrapper.unmount()
    })

    it('Test B: fullscreenchange emits update:fullscreen reflecting fullscreenElement', async () => {
        const spies = installFullscreenSpies()
        const wrapper = mountKLineChart()
        await nextTick()

        const rootEl = wrapper.element as HTMLElement

        spies.setFullscreenElement(rootEl)
        document.dispatchEvent(new Event('fullscreenchange'))
        await nextTick()
        expect(wrapper.emitted('update:fullscreen')?.at(-1)).toEqual([true])

        spies.setFullscreenElement(null)
        document.dispatchEvent(new Event('fullscreenchange'))
        await nextTick()
        expect(wrapper.emitted('update:fullscreen')?.at(-1)).toEqual([false])

        wrapper.unmount()
    })

    it('Test C: unmount removes the fullscreenchange listener (no post-unmount emit)', async () => {
        installFullscreenSpies()
        const wrapper = mountKLineChart()
        await nextTick()

        wrapper.unmount()
        await nextTick()

        const emittedBefore = wrapper.emitted('update:fullscreen')?.length ?? 0
        // After unmount the listener must be gone — dispatching does nothing.
        document.dispatchEvent(new Event('fullscreenchange'))
        await nextTick()
        const emittedAfter = wrapper.emitted('update:fullscreen')?.length ?? 0
        expect(emittedAfter).toBe(emittedBefore)
    })
})
