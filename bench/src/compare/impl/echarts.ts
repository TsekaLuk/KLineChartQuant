/**
 * Apache ECharts 适配器：按需注册的 candlestick + line 系列，category 轴 + inside dataZoom，
 * 用 dispatchAction('dataZoom') 滚动；关闭动画，其余保持默认（包括 large 模式阈值）。
 */

import { CandlestickChart, LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent } from 'echarts/components'
import { type ECharts, init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

import type { ChartSubject, VisibleRange } from '../types'
import { AXIS_SPACE, SCENE_COLORS } from './scene'

use([CandlestickChart, LineChart, DataZoomComponent, GridComponent, CanvasRenderer])

const GRID = { left: 8, top: 8, right: AXIS_SPACE.right, bottom: AXIS_SPACE.bottom } as const

/** 分钟线时间标签 HH:MM（UTC），只在挂载时生成一次。 */
function timeLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** 创建 ECharts 适配器。 */
export function createEChartsSubject(): ChartSubject {
  let chart: ECharts | null = null
  let startValue = 0
  let endValue = 0

  function mounted(): ECharts {
    if (!chart) throw new Error('ECharts is not mounted')
    return chart
  }

  /** 从已渲染的 x 轴把绘图区像素换算回类目索引，核验 dataZoom 确实生效。 */
  function indexAtPixel(x: number): number {
    const value = mounted().convertFromPixel({ xAxisIndex: 0 }, x)
    if (typeof value !== 'number') throw new Error('ECharts returned a non-scalar axis value')
    return value
  }

  return {
    async mount(container, dataset, visibleBars) {
      chart = init(container, null, { renderer: 'canvas' })
      const total = dataset.bars.length
      startValue = total - visibleBars
      endValue = total - 1
      chart.setOption({
        animation: false,
        backgroundColor: SCENE_COLORS.background,
        grid: GRID,
        xAxis: {
          type: 'category',
          data: dataset.bars.map((bar) => timeLabel(bar.timestamp)),
          axisLine: { lineStyle: { color: SCENE_COLORS.grid } },
          axisLabel: { color: SCENE_COLORS.text },
        },
        yAxis: {
          scale: true,
          position: 'right',
          axisLabel: { color: SCENE_COLORS.text },
          splitLine: { lineStyle: { color: SCENE_COLORS.grid } },
        },
        dataZoom: [{ type: 'inside', startValue, endValue }],
        series: [
          {
            type: 'candlestick',
            data: dataset.bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
            itemStyle: {
              color: SCENE_COLORS.up,
              color0: SCENE_COLORS.down,
              borderColor: SCENE_COLORS.up,
              borderColor0: SCENE_COLORS.down,
            },
          },
          ...dataset.ma.map((values, line) => ({
            type: 'line' as const,
            data: values.map((value) => value ?? '-'),
            showSymbol: false,
            silent: true,
            lineStyle: { width: 1, color: SCENE_COLORS.ma[line] },
          })),
        ],
      })
    },
    scrollOneBar() {
      startValue -= 1
      endValue -= 1
      mounted().dispatchAction({ type: 'dataZoom', startValue, endValue })
    },
    visibleRange(): VisibleRange {
      const width = mounted().getWidth()
      return { from: indexAtPixel(GRID.left + 1), to: indexAtPixel(width - GRID.right - 1) }
    },
    async destroy() {
      mounted().dispose()
      chart = null
    },
  }
}
