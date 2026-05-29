/**
 * Streaming data layer — types.
 *
 * This module is the framework-agnostic SHAPE every live data source
 * (Binance WS, Coinbase WS, Bao stock-style polled adapters, Tongdaxin
 * protocol, replay file) hands off to the controllers.
 *
 * Design goals — driven by the team's "高频 tick 是下一个架构大改的点"
 * direction:
 *
 *   - **Underlying layer reusable, not mixed with UI.** This file
 *     defines pure data shapes; no DOM, no controller binding, no
 *     framework. The React/Vue/Angular adapters bind further up.
 *
 *   - **Incremental.** Producers push one `Tick` at a time;
 *     consumers (e.g. `TickToBarAggregator`) materialize bars at
 *     time-bucket boundaries. There is no "fetch all history then
 *     batch" assumption — that's the slow path, not the contract.
 *
 *   - **Replay-symmetric.** A `DataSource` driven by historical data
 *     and one driven by a live WebSocket expose the same surface.
 *     The chart's bar-replay state machine doesn't need a separate
 *     code path for "fake feed vs real feed".
 *
 *   - **No timezone in the contract.** All timestamps are
 *     ms-since-epoch. Display formatting lives at the renderer
 *     boundary.
 */

/**
 * A single trade print.
 *
 * The minimum-viable tick. Exchanges that ship richer fields
 * (`tradeId`, `isBuyerMaker`, `aggregatorId`, ...) extend this via
 * the generic parameter on `DataSource<T>` rather than adding
 * fields here.
 */
export interface Tick {
    /** ms since Unix epoch. Monotonic per stream — producers MUST drop or buffer out-of-order ticks. */
    timestamp: number
    /** Trade price. Strictly positive. */
    price: number
    /** Trade size in base-asset units. Strictly positive. */
    size: number
    /**
     * Aggressor side, when the source can tell.
     *
     *   `'buy'`  — buyer-initiated (lifted ask)
     *   `'sell'` — seller-initiated (hit bid)
     *   `undefined` — unknown / classifier should infer downstream
     */
    side?: 'buy' | 'sell'
}

/**
 * Top-of-book quote update. Some sources interleave these with
 * trade ticks; the order-book accumulator + Lee-Ready classifier
 * in `FootprintController` consume them.
 */
export interface Quote {
    /** ms since Unix epoch. */
    timestamp: number
    /** Best bid price. */
    bid: number
    /** Best ask price. */
    ask: number
}

/**
 * Either-event union — most live sources interleave them on one
 * stream. Consumers branch on `kind`.
 */
export type MarketEvent =
    | ({ kind: 'tick' } & Tick)
    | ({ kind: 'quote' } & Quote)

/**
 * Framework-agnostic streaming source.
 *
 * Implementations:
 *   - `createReplayDataSource(events)` — drains a historical array
 *     at a configurable speed.
 *   - `createWebSocketDataSource({ url, parseFrame })` — bridges
 *     a WS to this shape.
 *   - User adapters for Binance / Coinbase / Tongdaxin / etc.
 *
 * `T` is whatever event shape the source emits. For mixed
 * trade-and-quote streams use `MarketEvent`; for trades-only
 * use `Tick`; for OHLCV-from-a-REST-endpoint use `Bar`.
 */
export interface DataSource<T> {
    /**
     * Subscribe to events. The handler fires synchronously for each
     * event the source produces. Returns an unsubscribe function;
     * after disposal, the handler is not invoked again.
     */
    subscribe(handler: (event: T) => void): () => void
    /**
     * True when the source is connected to a live feed (i.e. events
     * arrive in real time as they happen). False for replay /
     * historical sources.
     *
     * Consumers use this to decide between "show current price as
     * a flashing dot" (live) and "show closed bar" (replay).
     */
    isLive(): boolean
    /**
     * Tear down the underlying stream. After this returns,
     * `subscribe` becomes a no-op; in-flight events still pending
     * in the JS task queue may still fire before the listener
     * count reaches zero.
     */
    dispose(): void
}
