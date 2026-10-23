/** 确定性数据集：固定种子的几何随机游走分钟线，按均线档位预先计算各周期收盘价 SMA。 */

import type { BenchBar, BenchDataset, MaLineCount } from '../types'
import {
  BAR_INTERVAL_MS,
  DATASET_SEED,
  FIRST_BAR_TIMESTAMP,
  MA_LINE_SETS,
  TOTAL_BARS,
} from './scene'

/** 单根 K 线收盘价的最大相对变动；几何游走保证五万根后价格仍为正。 */
const STEP_RANGE = 0.004
/** 影线超出实体的最大相对幅度。 */
const WICK_RANGE = 0.0015

/** mulberry32：32 位种子的可复现伪随机数，返回 [0, 1)。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** 保留两位小数，与常见报价精度一致。 */
function cents(value: number): number {
  return Math.round(value * 100) / 100
}

/** 收盘价的滚动 SMA；窗口未满处为 null。 */
function simpleMovingAverage(bars: readonly BenchBar[], period: number): (number | null)[] {
  const values: (number | null)[] = new Array(bars.length)
  let sum = 0
  for (let index = 0; index < bars.length; index += 1) {
    sum += bars[index]!.close
    if (index >= period) sum -= bars[index - period]!.close
    values[index] = index >= period - 1 ? sum / period : null
  }
  return values
}

/**
 * 生成对比基准使用的整份 K 线；各均线档位共用同一份。
 *
 * @returns 五万根分钟 K 线；同一种子每次结果完全一致
 */
export function createBenchBars(): BenchBar[] {
  const random = mulberry32(DATASET_SEED)
  const bars: BenchBar[] = []
  let close = 100
  for (let index = 0; index < TOTAL_BARS; index += 1) {
    const open = close
    close = open * (1 + (random() - 0.5) * STEP_RANGE)
    bars.push({
      timestamp: FIRST_BAR_TIMESTAMP + index * BAR_INTERVAL_MS,
      open: cents(open),
      high: cents(Math.max(open, close) * (1 + random() * WICK_RANGE)),
      low: cents(Math.min(open, close) * (1 - random() * WICK_RANGE)),
      close: cents(close),
      volume: Math.round(1_000 + random() * 9_000),
    })
  }
  return bars
}

/**
 * 在给定 K 线上组装某个均线档位的数据集。
 *
 * @param bars - createBenchBars 生成的 K 线
 * @param maLines - 均线条数档位
 * @returns K 线与该档位全部周期的 SMA
 */
export function createBenchDataset(bars: readonly BenchBar[], maLines: MaLineCount): BenchDataset {
  const maPeriods = MA_LINE_SETS[maLines]
  return {
    bars,
    maLines,
    maPeriods,
    ma: maPeriods.map((period) => simpleMovingAverage(bars, period)),
  }
}
