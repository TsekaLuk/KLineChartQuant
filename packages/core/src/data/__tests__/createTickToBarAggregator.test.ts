/**
 * Tests for `createTickToBarAggregator`.
 *
 * Coverage:
 *   1. Construction validates intervalMs / maxGapFillBars.
 *   2. First tick opens the first bar (no emit; partialBar is set).
 *   3. Same-bucket ticks update high / low / close / volume in place.
 *   4. Crossing a bucket boundary closes the prior bar and opens a
 *      new one. `ingest` returns the closed bar.
 *   5. Skipping multiple buckets with fillGaps=false emits ONE closed
 *      bar (the previously-open one); the new bar starts at the new
 *      tick's bucket.
 *   6. Skipping multiple buckets with fillGaps=true emits closed-prior
 *      + zero-volume continuation bars + opens the new bar.
 *   7. maxGapFillBars caps the gap-fill emission.
 *   8. partialBar reflects the latest in-flight state.
 *   9. flush emits the partial bar and clears state.
 *  10. reset clears state without emitting.
 *  11. dispose makes ingest a no-op.
 *  12. Validation: non-finite ts / non-positive price / non-positive
 *      size / non-monotonic ts all throw KLineChartError.
 */

import { describe, it, expect } from 'vitest'

import { createTickToBarAggregator } from '..'
import type { Tick } from '..'
import { isKLineChartError } from '../../errors'

function tick(timestamp: number, price: number, size: number): Tick {
    return { timestamp, price, size }
}

// ---------------------------------------------------------------------------
// Construction validation
// ---------------------------------------------------------------------------

describe('createTickToBarAggregator — validation', () => {
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects intervalMs %p',
        (v) => {
            try {
                createTickToBarAggregator({ intervalMs: v })
                expect.fail(`expected throw for ${v}`)
            } catch (e) {
                expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
            }
        },
    )

    it('rejects fractional / negative maxGapFillBars', () => {
        for (const v of [-1, 1.5]) {
            try {
                createTickToBarAggregator({ intervalMs: 1000, maxGapFillBars: v })
                expect.fail(`expected throw for ${v}`)
            } catch (e) {
                expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
            }
        }
    })

    it('accepts maxGapFillBars=0 (gap-fill capped to nothing)', () => {
        expect(() =>
            createTickToBarAggregator({ intervalMs: 1000, maxGapFillBars: 0 }),
        ).not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// Same-bucket aggregation
// ---------------------------------------------------------------------------

describe('within a single bucket', () => {
    it('first tick opens a bar; no closed bars emitted', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        const out = a.ingest(tick(500, 100, 5))
        expect(out).toEqual([])
        expect(a.partialBar()).toEqual({
            timestamp: 0,
            open: 100,
            high: 100,
            low: 100,
            close: 100,
            volume: 5,
        })
    })

    it('subsequent ticks update high / low / close / volume in place', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(0, 100, 1))
        a.ingest(tick(100, 105, 2)) // new high
        a.ingest(tick(200, 95, 3)) // new low
        a.ingest(tick(300, 102, 4))
        expect(a.partialBar()).toEqual({
            timestamp: 0,
            open: 100,
            high: 105,
            low: 95,
            close: 102,
            volume: 10,
        })
    })
})

// ---------------------------------------------------------------------------
// Bucket-boundary close
// ---------------------------------------------------------------------------

describe('bucket boundary', () => {
    it('crossing the boundary closes the prior bar and opens a new one', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(0, 100, 1))
        a.ingest(tick(500, 102, 2))
        const closed = a.ingest(tick(1500, 103, 3))
        expect(closed).toHaveLength(1)
        expect(closed[0]).toEqual({
            timestamp: 0,
            open: 100,
            high: 102,
            low: 100,
            close: 102,
            volume: 3,
        })
        expect(a.partialBar()).toEqual({
            timestamp: 1000,
            open: 103,
            high: 103,
            low: 103,
            close: 103,
            volume: 3,
        })
    })

    it('skipping buckets without fillGaps emits only the prior bar', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(0, 100, 1))
        // Jump to bucket 5 — 4 buckets skipped
        const closed = a.ingest(tick(5_500, 110, 2))
        expect(closed).toHaveLength(1)
        expect(closed[0]?.timestamp).toBe(0)
        expect(a.partialBar()?.timestamp).toBe(5000)
    })
})

// ---------------------------------------------------------------------------
// Gap fill
// ---------------------------------------------------------------------------

describe('gap fill', () => {
    it('fillGaps=true emits zero-volume continuation bars between', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000, fillGaps: true })
        a.ingest(tick(0, 100, 1))
        const closed = a.ingest(tick(3_500, 110, 2))
        // closed: prior (ts=0) + 2 continuations (ts=1000, ts=2000)
        expect(closed).toHaveLength(3)
        expect(closed[0]?.timestamp).toBe(0)
        expect(closed[0]?.volume).toBe(1)
        for (const b of closed.slice(1)) {
            expect(b.volume).toBe(0)
            expect(b.open).toBe(100) // held forward
            expect(b.close).toBe(100)
        }
        expect(closed[1]?.timestamp).toBe(1000)
        expect(closed[2]?.timestamp).toBe(2000)
        expect(a.partialBar()?.timestamp).toBe(3000)
    })

    it('maxGapFillBars caps the gap-fill emission', () => {
        const a = createTickToBarAggregator({
            intervalMs: 1000,
            fillGaps: true,
            maxGapFillBars: 2,
        })
        a.ingest(tick(0, 100, 1))
        // 10 buckets skipped, but cap = 2
        const closed = a.ingest(tick(10_500, 110, 2))
        // 1 prior + 2 capped continuations
        expect(closed).toHaveLength(3)
    })
})

// ---------------------------------------------------------------------------
// partialBar / flush / reset / dispose
// ---------------------------------------------------------------------------

describe('partialBar', () => {
    it('is null before any tick', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        expect(a.partialBar()).toBeNull()
    })

    it('returns a fresh copy each call (no shared reference)', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(0, 100, 1))
        const p1 = a.partialBar()
        const p2 = a.partialBar()
        expect(p1).toEqual(p2)
        expect(p1).not.toBe(p2)
    })
})

describe('flush', () => {
    it('emits the partial bar and clears state', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(0, 100, 1))
        a.ingest(tick(500, 105, 2))
        const flushed = a.flush()
        expect(flushed?.timestamp).toBe(0)
        expect(flushed?.high).toBe(105)
        expect(a.partialBar()).toBeNull()
    })

    it('returns null when no bar is open', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        expect(a.flush()).toBeNull()
    })
})

describe('reset', () => {
    it('clears state without emitting', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(0, 100, 1))
        a.reset()
        expect(a.partialBar()).toBeNull()
        // After reset, can ingest a non-monotonic (earlier) tick.
        const out = a.ingest(tick(0, 50, 1))
        expect(out).toEqual([])
        expect(a.partialBar()?.open).toBe(50)
    })
})

describe('dispose', () => {
    it('makes ingest a no-op (returns empty)', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(0, 100, 1))
        a.dispose()
        const out = a.ingest(tick(1500, 200, 2))
        expect(out).toEqual([])
        expect(a.partialBar()).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// Validation on ingest
// ---------------------------------------------------------------------------

describe('ingest — validation', () => {
    it.each([
        ['non-finite ts', tick(Number.NaN, 100, 1)],
        ['non-positive price', tick(0, 0, 1)],
        ['negative price', tick(0, -1, 1)],
        ['non-positive size', tick(0, 100, 0)],
        ['negative size', tick(0, 100, -1)],
    ] as const)('rejects %s', (_label, t) => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        try {
            a.ingest(t)
            expect.fail('expected throw')
        } catch (e) {
            expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
        }
    })

    it('rejects out-of-order timestamp', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(500, 100, 1))
        try {
            a.ingest(tick(400, 101, 1))
            expect.fail('expected throw')
        } catch (e) {
            expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
        }
    })

    it('accepts equal timestamp (intra-tick burst)', () => {
        const a = createTickToBarAggregator({ intervalMs: 1000 })
        a.ingest(tick(500, 100, 1))
        expect(() => a.ingest(tick(500, 101, 2))).not.toThrow()
        expect(a.partialBar()?.volume).toBe(3)
    })
})
