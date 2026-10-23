/**
 * 对比场景的单一事实来源：数据规模、各均线档位的 MA 周期、随机种子与配色。
 * 配色取 KCQ 深色主题 Token，各库共用，只为截图观感一致，不影响计时。
 */

import { darkTheme } from '../../../../packages/core/src/foundation/tokens/theme-dark'
import type { MaLineCount } from '../types'

/** 数据总量：远大于任何可见窗口，采样期间不会滚到数据边界。 */
export const TOTAL_BARS = 50_000
/**
 * 各均线档位的周期表：5 线与 KCQ 内置 MA 默认参数一致；12 线在其后补齐常见的中长周期，
 * 模拟多指标叠加的重负载主图。
 */
export const MA_LINE_SETS: Readonly<Record<MaLineCount, readonly number[]>> = {
  5: [5, 10, 20, 30, 60],
  12: [5, 10, 20, 30, 60, 90, 120, 150, 180, 200, 250, 300],
}
export const BAR_INTERVAL_MS = 60_000
export const FIRST_BAR_TIMESTAMP = Date.UTC(2024, 0, 2, 1, 30)
export const DATASET_SEED = 20_261_022

const { colors } = darkTheme
const { palette } = colors

export const SCENE_COLORS = {
  background: colors.chartBackground,
  grid: colors.gridMajor,
  text: colors.axisText,
  up: colors.candleUpBody,
  down: colors.candleDownBody,
  ma: [
    palette.i1,
    palette.i2,
    palette.i3,
    palette.i4,
    palette.i5,
    palette.i6,
    palette.i7,
    palette.i8,
    palette.i9,
    palette.i10,
  ],
} as const

/**
 * 第 line 条均线的颜色；线数超过调色板长度时循环取色。
 *
 * @param line - 均线序号，从 0 开始
 * @returns 该均线的 CSS 颜色
 */
export function maColor(line: number): string {
  return SCENE_COLORS.ma[line % SCENE_COLORS.ma.length]!
}

/** 竞品绘图区留给价格轴与时间轴的空间，与 KCQ 默认右轴、底轴相当。 */
export const AXIS_SPACE = { right: 64, bottom: 28 } as const
