/**
 * Canonical market bar (OHLCV) — the type every consumer should reach for
 * when they need "one row of market data".
 *
 * Until now the codebase carried three identical interfaces with different
 * names: `OHLCV` (in `chartTypes/types.ts`), `BaseBar` (in
 * `mtfOverlay/types.ts`), and an inline shape in `chartTypes/rangeBars.ts`.
 * They are now all aliases of `Bar`. The old names remain exported for
 * backward compatibility (`@deprecated` — prefer `Bar`).
 *
 * Subset types — `Pick<Bar, ...>` — are also exported here so consumers
 * don't have to re-derive them:
 *
 *   - `ClosePrice`  — `{ timestamp, close }` (most chart math needs only
 *                     these two fields; declaring a parameter as `ClosePrice`
 *                     instead of `Bar` documents the read pattern and
 *                     lets callers pass narrower objects).
 *   - `HighLowBar`  — `{ high, low }`         (range-bar / Donchian / etc).
 *   - `AnchoredBar` — `{ high, low, close, volume }` (Anchored VWAP's
 *                     existing `AVWAPBar` — preserved as a distinct
 *                     export since adding `timestamp` would be a
 *                     breaking widen of its parameter contract).
 *
 * Why an interface, not a class:
 *
 *   - Bars flow through hot paths (per-tick draws); no method dispatch.
 *   - Consumers often arrive at `Bar` from a JSON.parse or a CSV stream.
 *     A class would require an unnecessary copy + constructor call.
 *
 * Why `timestamp: number` (not `Date`):
 *
 *   - Plain numbers serialise + compare in O(1).
 *   - The contract is "ms since epoch" — leave timezone semantics to
 *     the display layer.
 */

/**
 * A market OHLCV bar — one row of price + volume at a single time.
 *
 * All fields are required and finite. NaN / Infinity in any field is a
 * caller bug; the libraries do not silently sanitize.
 */
export interface Bar {
    /** ms since Unix epoch. Strictly monotonic across an array of bars. */
    timestamp: number
    /** Open price for the bar's interval. */
    open: number
    /** High price for the bar's interval. */
    high: number
    /** Low price for the bar's interval. */
    low: number
    /** Close price for the bar's interval. */
    close: number
    /** Volume traded during the bar's interval. >= 0. */
    volume: number
}

/**
 * Just `{ timestamp, close }` — the narrowest shape that supports most
 * chart-math primitives (moving averages, EMA, RSI, MACD on close,
 * etc.).
 *
 * Declaring a parameter as `ClosePrice` instead of `Bar` documents that
 * the function reads only those two fields and lets callers pass
 * narrower objects.
 */
export type ClosePrice = Pick<Bar, 'timestamp' | 'close'>

/**
 * `{ high, low }` — Donchian / Renko / range-bar primitives operate on
 * this shape. Time is not a coordinate for these; the input is already
 * ordered.
 */
export type HighLowBar = Pick<Bar, 'high' | 'low'>

/**
 * `{ high, low, close, volume }` — what Anchored VWAP consumes. Kept
 * distinct from `Bar` because adding `timestamp` would widen the
 * existing public contract of `AVWAPBar` (a downstream import may
 * legitimately pass objects without a timestamp field).
 */
export type AnchoredBar = Pick<Bar, 'high' | 'low' | 'close' | 'volume'>
