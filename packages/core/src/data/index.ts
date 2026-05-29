/**
 * @klinechart-quant/core/data — streaming data primitives.
 *
 * Framework-agnostic shapes every live source (Binance / Coinbase /
 * BaoStock / Tongdaxin / replay) and every consumer (footprint /
 * volume profile / heatmap / chart) shares. See `./types.ts` and
 * `./createTickToBarAggregator.ts` for the design notes.
 */

export type { Tick, Quote, MarketEvent, DataSource } from './types'
export {
    createTickToBarAggregator,
    type TickToBarAggregator,
    type TickToBarAggregatorOptions,
} from './createTickToBarAggregator'
