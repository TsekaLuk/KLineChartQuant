/**
 * @klinechart-quant/core/indicators — headless indicator math.
 *
 * Pure functions over price arrays. No DOM, no signals, no controllers —
 * these are the building blocks consumers compose into UI flows or feed
 * to the legacy scheduler in `src/core/indicators/`.
 *
 * Convention: each indicator's output is a `Float64Array` of the same length
 * as the input, with NaN for indices where the indicator hasn't primed yet.
 * This makes alignment with bar arrays trivial in render code.
 */

export { computeALMA, type AlmaOptions } from './alma'
export { computeT3, type T3Options } from './t3'
export { computeZLEMA, type ZlemaOptions } from './zlema'
export { computeLSMA, type LsmaOptions } from './lsma'
export { computeVIDYA, type VidyaOptions } from './vidya'
export { computeFRAMA, type FramaOptions } from './frama'
