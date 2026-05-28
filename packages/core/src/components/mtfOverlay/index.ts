/**
 * Multi-Timeframe (MTF) overlay barrel.
 *
 * Public surface:
 *   - `resampleBars`: aggregate base-tf bars into higher-tf buckets
 *   - `alignToBaseIndex`: forward-fill higher-tf values onto base-bar indices
 *     (no-lookahead semantics, see file docstring)
 *   - `createMtfController`: composes the above + a user-supplied `compute`
 *     into a reactive multi-series controller
 *
 * The controller is intentionally indicator-agnostic — any indicator (EMA,
 * RSI, custom) can be lifted to MTF by passing a `compute` fn that takes
 * resampled bars and returns one number per bar.
 */

export type {
    BaseBar,
    ResampledBar,
    MtfSeriesDefinition,
    ActiveMtfSeries,
    MtfController,
} from './types'

export { resampleBars } from './resampleBars'
export { alignToBaseIndex } from './alignToBaseIndex'
export { createMtfController, type CreateMtfControllerInit } from './createMtfController'
