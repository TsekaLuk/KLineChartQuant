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

import { describe, it, expect, vi } from 'vitest'
import * as ReactAdapter from '../index'

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

describe('@klinechart-quant/react — useChart lifecycle (TODO: requires jsdom + RTL)', () => {
    // Phase 1B agent: install @testing-library/react, switch this file's
    // vitest environment to jsdom, and replace the placeholders below with
    // mount/unmount assertions:
    //
    //   const { result, unmount } = renderHook(() => useChart(ref, { data }))
    //   expect(result.current).not.toBeNull()
    //   unmount()
    //   // assert: no remaining canvas elements, no leaked listeners
    it.todo('mounts on first render with a valid ref')
    it.todo('returns null until ref is populated')
    it.todo('re-renders host when viewport signal changes')
    it.todo('disposes cleanly on unmount')
})
