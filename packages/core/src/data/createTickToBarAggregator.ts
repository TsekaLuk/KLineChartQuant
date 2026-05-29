/**
 * Tick → Bar aggregator — the streaming primitive every live UI builds on.
 *
 * Consumes a stream of `Tick`s and emits closed `Bar`s on bucket
 * boundaries. The current incomplete bar is queryable via
 * `partialBar()` so renderers can draw the "currently forming" candle
 * without waiting for it to close.
 *
 * Why this lives in `core` and not in `controllers/` (yet):
 *
 *   The team's "底层可复用，不跟 UI 混" decision applies here. Both the
 *   future demo (BTC/USDT WS) and the existing footprint / volume
 *   profile / heatmap controllers want this transform. Lifting it
 *   to a controller now would couple it to signal plumbing the
 *   transform itself does not need.
 *
 * Boundary semantics:
 *
 *   bucket(t) = floor(t / intervalMs) * intervalMs
 *
 *   - The first tick of a new bucket *closes* the previous one and
 *     opens a fresh one whose `open` is the new tick's price.
 *   - When several buckets are skipped (no trade activity for a
 *     while), the aggregator does NOT manufacture empty in-between
 *     bars by default. Markets with gaps look like gaps. Set
 *     `fillGaps: true` to emit zero-volume continuation bars
 *     instead (last close held across).
 *
 * Performance:
 *
 *   - O(1) per ingest. No object allocations on the hot path —
 *     the partial-bar struct is mutated in place; we only allocate
 *     when a bar closes and a snapshot is published.
 */

import { KLineChartError } from '../errors'
import type { Bar } from '../types/bar'
import type { Tick } from './types'

export interface TickToBarAggregatorOptions {
    /** Bar interval in ms. Must be > 0. */
    readonly intervalMs: number
    /**
     * Emit zero-volume continuation bars for skipped buckets.
     * Default false (markets with gaps look like gaps).
     */
    readonly fillGaps?: boolean
    /**
     * Maximum gap-fill bars per ingest. Guard against pathological
     * inputs (a tick with `timestamp = now + 7 days` and `fillGaps
     * = true` would otherwise emit 7 days * 24 hours * 60 / interval
     * synthetic bars). Default 10_000.
     */
    readonly maxGapFillBars?: number
}

export interface TickToBarAggregator {
    /**
     * Feed one tick. Returns the array of newly closed bars (length
     * 0 or 1 normally; > 1 only when `fillGaps: true` and the tick
     * lands several buckets later than the previous one).
     *
     * Throws `KLineChartError('INVALID_PARAM')` on a non-finite or
     * non-positive `price` / `size`, and on `timestamp` going
     * backwards (downstream code assumes monotonicity).
     */
    ingest(tick: Tick): ReadonlyArray<Bar>
    /**
     * Snapshot the currently-forming bar, or `null` if no tick has
     * been ingested yet. The returned object is a fresh copy — safe
     * to retain.
     */
    partialBar(): Bar | null
    /**
     * Force-close the current partial bar and return it (if any).
     * Use on `dispose` or on a known session boundary.
     */
    flush(): Bar | null
    /** Reset state. Next ingest opens a fresh bar. */
    reset(): void
    dispose(): void
}

function bucketStart(t: number, intervalMs: number): number {
    return Math.floor(t / intervalMs) * intervalMs
}

interface InternalBar {
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume: number
}

function snapshot(p: InternalBar): Bar {
    return {
        timestamp: p.timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
    }
}

export function createTickToBarAggregator(
    opts: TickToBarAggregatorOptions,
): TickToBarAggregator {
    if (!Number.isFinite(opts.intervalMs) || opts.intervalMs <= 0) {
        throw new KLineChartError(
            'INVALID_PARAM',
            `createTickToBarAggregator: intervalMs must be > 0, got ${opts.intervalMs}`,
        )
    }
    if (
        opts.maxGapFillBars !== undefined &&
        (!Number.isInteger(opts.maxGapFillBars) || opts.maxGapFillBars < 0)
    ) {
        throw new KLineChartError(
            'INVALID_PARAM',
            `createTickToBarAggregator: maxGapFillBars must be a non-negative integer, got ${opts.maxGapFillBars}`,
        )
    }

    const intervalMs = opts.intervalMs
    const fillGaps = opts.fillGaps ?? false
    const maxGapFillBars = opts.maxGapFillBars ?? 10_000

    let current: InternalBar | null = null
    let lastTickTs = -Infinity
    let disposed = false

    function ingest(tick: Tick): ReadonlyArray<Bar> {
        if (disposed) return []
        if (!Number.isFinite(tick.timestamp)) {
            throw new KLineChartError(
                'INVALID_PARAM',
                `TickToBarAggregator.ingest: timestamp must be finite, got ${tick.timestamp}`,
            )
        }
        if (!Number.isFinite(tick.price) || tick.price <= 0) {
            throw new KLineChartError(
                'INVALID_PARAM',
                `TickToBarAggregator.ingest: price must be > 0, got ${tick.price}`,
            )
        }
        if (!Number.isFinite(tick.size) || tick.size <= 0) {
            throw new KLineChartError(
                'INVALID_PARAM',
                `TickToBarAggregator.ingest: size must be > 0, got ${tick.size}`,
            )
        }
        if (tick.timestamp < lastTickTs) {
            throw new KLineChartError(
                'INVALID_PARAM',
                `TickToBarAggregator.ingest: timestamps must be monotonic, got ${tick.timestamp} after ${lastTickTs}`,
            )
        }
        lastTickTs = tick.timestamp

        const bucketTs = bucketStart(tick.timestamp, intervalMs)

        // First tick ever — open the first bar.
        if (current === null) {
            current = {
                timestamp: bucketTs,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price,
                volume: tick.size,
            }
            return []
        }

        // Same bucket — update in place.
        if (bucketTs === current.timestamp) {
            if (tick.price > current.high) current.high = tick.price
            if (tick.price < current.low) current.low = tick.price
            current.close = tick.price
            current.volume += tick.size
            return []
        }

        // New bucket. Close the previous bar; optionally emit gap-fill
        // continuation bars; open a fresh bar from the new tick.
        const closed: Bar[] = [snapshot(current)]
        if (fillGaps) {
            // Emit one zero-volume bar per skipped bucket.
            const skippedBuckets = (bucketTs - current.timestamp) / intervalMs - 1
            const fillCount = Math.min(skippedBuckets, maxGapFillBars)
            const holdClose = current.close
            for (let i = 1; i <= fillCount; i++) {
                const ts = current.timestamp + i * intervalMs
                closed.push({
                    timestamp: ts,
                    open: holdClose,
                    high: holdClose,
                    low: holdClose,
                    close: holdClose,
                    volume: 0,
                })
            }
        }
        current = {
            timestamp: bucketTs,
            open: tick.price,
            high: tick.price,
            low: tick.price,
            close: tick.price,
            volume: tick.size,
        }
        return closed
    }

    function partialBar(): Bar | null {
        if (current === null) return null
        return snapshot(current)
    }

    function flush(): Bar | null {
        if (current === null) return null
        const out = snapshot(current)
        current = null
        return out
    }

    function reset(): void {
        if (disposed) return
        current = null
        lastTickTs = -Infinity
    }

    function dispose(): void {
        if (disposed) return
        disposed = true
        current = null
    }

    return { ingest, partialBar, flush, reset, dispose }
}
