/**
 * TradingView Lightweight Charts 适配器：蜡烛 + 五条 LineSeries（库本身没有内置 MA，按官方示例预先计算），
 * 用 timeScale().scrollToPosition 滚动。
 */

import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type LineData,
  LineSeries,
  type UTCTimestamp,
  type WhitespaceData,
} from 'lightweight-charts'

import type { ChartSubject, VisibleRange } from '../types'
import { maColor, SCENE_COLORS } from './scene'

/** 允许的最小 bar 间距（CSS px）；默认 0.5 会限制千根级可见窗口。 */
const MIN_BAR_SPACING = 0.05

/** 毫秒时间戳转库要求的 UTC 秒。 */
function toTime(timestamp: number): UTCTimestamp {
  return (timestamp / 1000) as UTCTimestamp
}

/** 创建 Lightweight Charts 适配器。 */
export function createLightweightChartsSubject(): ChartSubject {
  let chart: IChartApi | null = null

  function mounted(): IChartApi {
    if (!chart) throw new Error('Lightweight Charts is not mounted')
    return chart
  }

  return {
    async mount(container, dataset, visibleBars) {
      chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { color: SCENE_COLORS.background },
          textColor: SCENE_COLORS.text,
        },
        grid: {
          vertLines: { color: SCENE_COLORS.grid },
          horzLines: { color: SCENE_COLORS.grid },
        },
        timeScale: { minBarSpacing: MIN_BAR_SPACING, rightOffset: 0, timeVisible: true },
      })
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: SCENE_COLORS.up,
        downColor: SCENE_COLORS.down,
        wickUpColor: SCENE_COLORS.up,
        wickDownColor: SCENE_COLORS.down,
        borderVisible: false,
      })
      candles.setData(
        dataset.bars.map((bar) => ({
          time: toTime(bar.timestamp),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      )
      dataset.ma.forEach((values, line) => {
        const series = mounted().addSeries(LineSeries, {
          color: maColor(line),
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        series.setData(
          values.map((value, index): LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp> => {
            const time = toTime(dataset.bars[index]!.timestamp)
            return value === null ? { time } : { time, value }
          }),
        )
      })
      const total = dataset.bars.length
      chart.timeScale().setVisibleLogicalRange({ from: total - visibleBars, to: total - 1 })
    },
    scrollOneBar() {
      const timeScale = mounted().timeScale()
      timeScale.scrollToPosition(timeScale.scrollPosition() - 1, false)
    },
    visibleRange(): VisibleRange {
      const range = mounted().timeScale().getVisibleLogicalRange()
      if (!range) throw new Error('Lightweight Charts has no visible range')
      return { from: range.from, to: range.to }
    },
    async destroy() {
      mounted().remove()
      chart = null
    },
  }
}
