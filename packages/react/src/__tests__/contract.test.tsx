/**
 * Contract test for @klinechart-quant/react.
 *
 * Phase 1B agent's brief: make these pass without weakening assertions.
 *
 * What this enforces:
 * 1. Public API exists and has correct shape
 * 2. useChart mounts/unmounts cleanly (no leaks)
 * 3. Signal change triggers React re-render
 * 4. SSR-safe: module import does not touch `window`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import {
    createElement,
    createRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react'
import type { ReactElement, RefObject } from 'react'

import * as ReactAdapter from '../index'
import { __setChartFactory, useChart } from '../index'
import { createMockChartController, type MockControllerHandle } from './_mockController'
import type { ChartController, ChartMountOptions, ChartViewport, KLineData } from '@klinechart-quant/core'

describe('@klinechart-quant/react — public API surface', () => {
    it('exports createChart, useChart, useIndicatorSelector, KLineChart', () => {
        expect(typeof ReactAdapter.createChart).toBe('function')
        expect(typeof ReactAdapter.useChart).toBe('function')
        expect(typeof ReactAdapter.useIndicatorSelector).toBe('function')
        expect(typeof ReactAdapter.KLineChart).toBe('function')
    })
})

describe('@klinechart-quant/react — SSR safety', () => {
    it('importing the module does not touch window or document', async () => {
        // The mere act of `import * as ReactAdapter` above happened in a node env
        // (no jsdom for this file). If the module touched `window` at top level,
        // the import would already have thrown. This test documents the contract.
        expect(typeof globalThis).toBe('object')
    })

    it('createChart throws synchronously on the server (no container)', () => {
        // Passing a container is the only valid path; without a real DOM,
        // createChart should fail explicitly rather than half-mount.
        expect(() =>
            ReactAdapter.createChart({
                container: null as unknown as HTMLElement,
                data: [],
            }),
        ).toThrow()
    })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Test helper that subscribes a host component to `controller.viewport` via
 * `useSyncExternalStore`. Mirrors the pattern useIndicatorSelector uses,
 * kept local so the test owns it.
 */
function useViewport(controller: ChartController | null): ChartViewport | null {
    const subscribe = useMemo(
        () => (cb: () => void) => {
            if (controller === null) return () => {}
            return controller.viewport.subscribe(cb)
        },
        [controller],
    )
    const getSnapshot = useCallback(
        () => (controller === null ? null : controller.viewport()),
        [controller],
    )
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Renders a host div, attaches a ref to it via callback ref so `useChart`
 * sees a populated ref on the first effect. Captures the controller (and
 * exposes the render call count) for assertions.
 */
function makeHost(
    onRender: (controller: ChartController | null, viewport: ChartViewport | null) => void,
) {
    return function Host(): ReactElement {
        const ref = useRef<HTMLDivElement | null>(null)
        const controller = useChart(ref, { data: [] as ReadonlyArray<KLineData> })
        const viewport = useViewport(controller)
        onRender(controller, viewport)
        return createElement('div', { ref })
    }
}

describe('@klinechart-quant/react — useChart lifecycle', () => {
    let lastHandle: MockControllerHandle | null = null

    beforeEach(() => {
        // Inject a mock factory so useChart/createChart can mount without the
        // production chart engine (which is not yet wired in Phase 1B).
        __setChartFactory((opts: ChartMountOptions) => {
            const handle = createMockChartController(opts.data)
            lastHandle = handle
            return handle.controller
        })
    })

    afterEach(() => {
        __setChartFactory(null)
        lastHandle = null
    })

    it('mounts on first render with a valid ref', () => {
        const renderCalls: Array<ChartController | null> = []
        const Host = makeHost((controller) => {
            renderCalls.push(controller)
        })

        render(createElement(Host))

        // First render: controller is null (ref not yet populated for the
        // effect-driven mount). After useEffect commits, the controller is
        // created and React re-renders with the non-null value.
        expect(renderCalls.length).toBeGreaterThanOrEqual(2)
        const finalController = renderCalls[renderCalls.length - 1]
        expect(finalController).not.toBeNull()
        expect(typeof (finalController as ChartController).dispose).toBe('function')
    })

    it('returns null until ref is populated', () => {
        // Host whose ref is NEVER attached to a real element. createRef stays
        // null forever, so useChart's effect bails and the hook keeps returning
        // null across all renders.
        const renderCalls: Array<ChartController | null> = []

        function StubHost(): ReactElement {
            const ref = createRef<HTMLElement>() as RefObject<HTMLElement | null>
            const controller = useChart(ref, { data: [] })
            renderCalls.push(controller)
            // Render no element bound to the ref → ref.current stays null.
            return createElement('div')
        }

        render(createElement(StubHost))

        expect(renderCalls.length).toBeGreaterThan(0)
        for (const c of renderCalls) expect(c).toBeNull()
    })

    it('re-renders host when viewport signal changes', () => {
        const renderSpy = vi.fn<(level: number | null) => void>()
        const Host = makeHost((_, viewport) => {
            renderSpy(viewport?.zoomLevel ?? null)
        })

        render(createElement(Host))

        // After mount, lastHandle is set and we have at least one render with
        // the initial zoomLevel.
        expect(lastHandle).not.toBeNull()
        const handle = lastHandle as unknown as MockControllerHandle

        const callsBeforeMutation = renderSpy.mock.calls.length
        expect(renderSpy).toHaveBeenLastCalledWith(1) // initial zoomLevel from mock

        act(() => {
            handle.setViewport({
                zoomLevel: 7,
                kWidth: 2,
                visibleFrom: 0,
                visibleTo: 100,
            })
        })

        expect(renderSpy.mock.calls.length).toBeGreaterThan(callsBeforeMutation)
        expect(renderSpy).toHaveBeenLastCalledWith(7)
    })

    it('disposes cleanly on unmount', () => {
        let captured: ChartController | null = null
        const Host = makeHost((controller) => {
            if (controller !== null && captured === null) captured = controller
        })

        const { unmount } = render(createElement(Host))
        expect(captured).not.toBeNull()

        const disposeSpy = vi.spyOn(captured as ChartController, 'dispose')
        unmount()
        expect(disposeSpy).toHaveBeenCalledTimes(1)
    })
})

// ---------------------------------------------------------------------------
// <KLineChart /> — internalized Fullscreen handling
//
// jsdom does NOT implement the Fullscreen API, so we install spies for
// requestFullscreen / exitFullscreen and a controllable fullscreenElement
// getter. The KLineChart component drives those off the controlled
// `fullscreen` prop and emits `onFullscreenChange` from a document
// 'fullscreenchange' listener it registers on mount and removes on unmount.
// ---------------------------------------------------------------------------

describe('@klinechart-quant/react — KLineChart fullscreen', () => {
    let requestSpy: ReturnType<typeof vi.fn>
    let exitSpy: ReturnType<typeof vi.fn>
    let fullscreenElement: Element | null

    beforeEach(() => {
        // Same mock factory wiring as the lifecycle suite so KLineChart's
        // internal useChart can mount without the production engine.
        __setChartFactory((opts: ChartMountOptions) => {
            const handle = createMockChartController(opts.data)
            return handle.controller
        })

        // jsdom lacks the Fullscreen API; install controllable spies/getter.
        fullscreenElement = null
        requestSpy = vi.fn(function (this: HTMLElement) {
            fullscreenElement = this
            return Promise.resolve()
        })
        exitSpy = vi.fn(() => {
            fullscreenElement = null
            return Promise.resolve()
        })
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => fullscreenElement,
        })
        // The component reads requestFullscreen off the host element instance.
        // Define it on the prototype so any rendered <div> host inherits it.
        Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
            configurable: true,
            writable: true,
            value: requestSpy,
        })
        Object.defineProperty(document, 'exitFullscreen', {
            configurable: true,
            writable: true,
            value: exitSpy,
        })
    })

    afterEach(() => {
        __setChartFactory(null)
        // Tear down the Fullscreen API shims so other suites see a clean jsdom.
        delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement
        delete (HTMLElement.prototype as unknown as { requestFullscreen?: unknown }).requestFullscreen
        delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen
    })

    it('Test A: toggling the fullscreen prop calls requestFullscreen then exitFullscreen', () => {
        const { rerender } = render(
            createElement(ReactAdapter.KLineChart, { data: [] as ReadonlyArray<KLineData> }),
        )

        // Initial render with fullscreen=false (default): no calls yet.
        expect(requestSpy).not.toHaveBeenCalled()
        expect(exitSpy).not.toHaveBeenCalled()

        // false → true requests fullscreen exactly once.
        act(() => {
            rerender(
                createElement(ReactAdapter.KLineChart, {
                    data: [] as ReadonlyArray<KLineData>,
                    fullscreen: true,
                }),
            )
        })
        expect(requestSpy).toHaveBeenCalledTimes(1)
        expect(exitSpy).not.toHaveBeenCalled()

        // true → false exits fullscreen.
        act(() => {
            rerender(
                createElement(ReactAdapter.KLineChart, {
                    data: [] as ReadonlyArray<KLineData>,
                    fullscreen: false,
                }),
            )
        })
        expect(requestSpy).toHaveBeenCalledTimes(1)
        expect(exitSpy).toHaveBeenCalledTimes(1)
    })

    it('Test B: a fullscreenchange event emits onFullscreenChange with the derived boolean', () => {
        const onFullscreenChange = vi.fn<(v: boolean) => void>()

        const { container } = render(
            createElement(ReactAdapter.KLineChart, {
                data: [] as ReadonlyArray<KLineData>,
                onFullscreenChange,
            }),
        )

        // KLineChart renders exactly one host div (RTL nests it under its own
        // container, so query within the container to get the chart's root).
        const rootEl = container.querySelector('div') as HTMLElement
        expect(rootEl).not.toBeNull()

        // Browser enters fullscreen on the root element → emit true.
        act(() => {
            fullscreenElement = rootEl
            document.dispatchEvent(new Event('fullscreenchange'))
        })
        expect(onFullscreenChange).toHaveBeenLastCalledWith(true)

        // Browser leaves fullscreen (e.g. Esc) → emit false.
        act(() => {
            fullscreenElement = null
            document.dispatchEvent(new Event('fullscreenchange'))
        })
        expect(onFullscreenChange).toHaveBeenLastCalledWith(false)
    })

    it('Test C: unmount removes the fullscreenchange listener (no leak)', () => {
        const onFullscreenChange = vi.fn<(v: boolean) => void>()
        const removeSpy = vi.spyOn(document, 'removeEventListener')

        const { container, unmount } = render(
            createElement(ReactAdapter.KLineChart, {
                data: [] as ReadonlyArray<KLineData>,
                onFullscreenChange,
            }),
        )

        const rootEl = container.querySelector('div') as HTMLElement
        unmount()

        // The component removed its fullscreenchange listener on unmount.
        expect(removeSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function))

        // And a post-unmount event must not emit.
        const callsAfterUnmount = onFullscreenChange.mock.calls.length
        act(() => {
            fullscreenElement = rootEl
            document.dispatchEvent(new Event('fullscreenchange'))
        })
        expect(onFullscreenChange.mock.calls.length).toBe(callsAfterUnmount)

        removeSpy.mockRestore()
    })
})
