/**
 * Tests for the canonical {@link Bar} type and its subset helpers.
 *
 * Most of the work here is *type-level* — TypeScript's structural
 * checker enforces what the runtime cannot reach. The runtime
 * assertions confirm the JSDoc-stated contract (`Bar` is the same
 * shape as `OHLCV` and `BaseBar`) so a future maintainer who
 * accidentally drifts one of the aliases breaks a test.
 *
 * Coverage:
 *   1. `Bar` shape — all six fields present and `number`-typed at
 *      runtime.
 *   2. Cross-package alias assignability:
 *        - `Bar` ↔ `OHLCV` (from `chartTypes/types`)
 *        - `Bar` ↔ `BaseBar` (from `components/mtfOverlay`)
 *        - `AnchoredBar` ↔ `AVWAPBar` (from `components/anchoredVwap`)
 *   3. `ClosePrice` is satisfied by any `Bar`.
 *   4. `HighLowBar` is satisfied by any `Bar`.
 *   5. `AnchoredBar` is satisfied by any `Bar` (but NOT vice versa —
 *      `AnchoredBar` lacks `timestamp` + `open`).
 */

import { describe, it, expect } from 'vitest'

import type { Bar, ClosePrice, HighLowBar, AnchoredBar } from '..'
import type { OHLCV } from '../../chartTypes/types'
import type { BaseBar } from '../../components/mtfOverlay/types'
import type { AVWAPBar } from '../../components/anchoredVwap/types'

// ---------------------------------------------------------------------------
// A representative bar fixture
// ---------------------------------------------------------------------------

const SAMPLE: Bar = {
    timestamp: 1_700_000_000_000,
    open: 100,
    high: 105,
    low: 99,
    close: 102,
    volume: 12_345,
}

// ---------------------------------------------------------------------------
// Runtime shape — the six fields are present and finite numbers
// ---------------------------------------------------------------------------

describe('Bar — shape', () => {
    it.each(['timestamp', 'open', 'high', 'low', 'close', 'volume'] as const)(
        '%s is a finite number',
        (key) => {
            expect(typeof SAMPLE[key]).toBe('number')
            expect(Number.isFinite(SAMPLE[key])).toBe(true)
        },
    )

    it('has exactly six own keys (no accidental extras leak into the type)', () => {
        expect(Object.keys(SAMPLE).sort()).toEqual([
            'close',
            'high',
            'low',
            'open',
            'timestamp',
            'volume',
        ])
    })
})

// ---------------------------------------------------------------------------
// Cross-package alias assignability (compile-time, asserted via const ref)
// ---------------------------------------------------------------------------

describe('Bar — backwards-compatible aliases', () => {
    it('Bar is assignable to OHLCV and back', () => {
        const asOHLCV: OHLCV = SAMPLE
        const asBar: Bar = asOHLCV
        expect(asBar).toBe(SAMPLE)
    })

    it('Bar is assignable to BaseBar and back', () => {
        const asBaseBar: BaseBar = SAMPLE
        const asBar: Bar = asBaseBar
        expect(asBar).toBe(SAMPLE)
    })

    it('AnchoredBar is assignable to AVWAPBar and back', () => {
        const a: AnchoredBar = { high: 1, low: 0.5, close: 0.9, volume: 10 }
        const b: AVWAPBar = a
        const c: AnchoredBar = b
        expect(c).toEqual(a)
    })
})

// ---------------------------------------------------------------------------
// Pick<> subset helpers — Bar widens to satisfy each
// ---------------------------------------------------------------------------

describe('Bar — Pick<> subset helpers', () => {
    it('Bar satisfies ClosePrice', () => {
        const cp: ClosePrice = SAMPLE
        expect(cp.close).toBe(102)
        expect(cp.timestamp).toBe(1_700_000_000_000)
    })

    it('Bar satisfies HighLowBar', () => {
        const hl: HighLowBar = SAMPLE
        expect(hl.high).toBe(105)
        expect(hl.low).toBe(99)
    })

    it('Bar satisfies AnchoredBar', () => {
        const ab: AnchoredBar = SAMPLE
        expect(ab.high).toBe(105)
        expect(ab.low).toBe(99)
        expect(ab.close).toBe(102)
        expect(ab.volume).toBe(12_345)
    })

    it('ClosePrice alone does NOT satisfy Bar (subset is narrower)', () => {
        const cp: ClosePrice = { timestamp: 1, close: 2 }
        // The line below MUST be a TypeScript error if uncommented:
        //   const wrongWidening: Bar = cp
        // We assert behaviour-wise by checking the object lacks the
        // fields that `Bar` requires.
        expect('open' in cp).toBe(false)
        expect('high' in cp).toBe(false)
        expect('low' in cp).toBe(false)
        expect('volume' in cp).toBe(false)
    })
})
