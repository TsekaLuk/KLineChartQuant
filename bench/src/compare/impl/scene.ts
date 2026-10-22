/**
 * 对比场景的单一事实来源：数据规模、MA 周期、随机种子与竞品配色。
 * 竞品配色取 KCQ 深色主题 Token，只为截图观感一致，不影响计时。
 */

import { darkTheme } from '../../../../packages/core/src/foundation/tokens/theme-dark'

/** 数据总量：远大于任何可见窗口，采样期间不会滚到数据边界。 */
export const TOTAL_BARS = 50_000
/** 与 KCQ 内置 MA 默认参数一致的五条均线。 */
export const MA_PERIODS = [5, 10, 20, 30, 60] as const
export const BAR_INTERVAL_MS = 60_000
export const FIRST_BAR_TIMESTAMP = Date.UTC(2024, 0, 2, 1, 30)
export const DATASET_SEED = 20_261_022

const { colors } = darkTheme

export const SCENE_COLORS = {
  background: colors.chartBackground,
  grid: colors.gridMajor,
  text: colors.axisText,
  up: colors.candleUpBody,
  down: colors.candleDownBody,
  ma: [colors.palette.i1, colors.palette.i2, colors.palette.i3, colors.palette.i4, colors.palette.i5],
} as const

/** 竞品绘图区留给价格轴与时间轴的空间，与 KCQ 默认右轴、底轴相当。 */
export const AXIS_SPACE = { right: 64, bottom: 28 } as const
