/**
 * KLineChart（klinecharts）适配器：DataLoader 一次性喂入整份数据，内置 MA 指标按数据集周期叠加在主图
 * （每个 calcParam 生成一条线，线色按序号循环取 indicator.lines），按 bar 间距换算可见根数，用 scrollByDistance 滚动。
 */

import { type Chart, dispose, init } from 'klinecharts'

import type { ChartSubject, VisibleRange } from '../types'
import { maColor, SCENE_COLORS } from './scene'

const CANDLE_PANE_ID = 'candle_pane'
/** 放宽最小 bar 间距，使千根级可见窗口可达。 */
const MIN_BAR_SPACE = 0.5

/** 创建 KLineChart 适配器。 */
export function createKLineChartsSubject(): ChartSubject {
  let chart: Chart | null = null
  let host: HTMLElement | null = null
  let barSpace = 0

  function mounted(): Chart {
    if (!chart) throw new Error('KLineChart is not mounted')
    return chart
  }

  return {
    async mount(container, dataset, visibleBars) {
      host = container
      const created = init(container, {
        layout: { barSpaceLimit: { min: MIN_BAR_SPACE } },
        styles: {
          grid: {
            horizontal: { color: SCENE_COLORS.grid },
            vertical: { color: SCENE_COLORS.grid },
          },
          candle: {
            bar: {
              upColor: SCENE_COLORS.up,
              downColor: SCENE_COLORS.down,
              upBorderColor: SCENE_COLORS.up,
              downBorderColor: SCENE_COLORS.down,
              upWickColor: SCENE_COLORS.up,
              downWickColor: SCENE_COLORS.down,
            },
          },
          indicator: {
            lines: SCENE_COLORS.ma.map((_, line) => ({
              style: 'solid',
              smooth: false,
              size: 1,
              dashedValue: [2, 2],
              color: maColor(line),
            })),
          },
        },
      })
      if (!created) throw new Error('KLineChart init returned null')
      chart = created
      const bars = [...dataset.bars]
      await new Promise<void>((resolve) => {
        created.setSymbol({ ticker: 'BENCH', pricePrecision: 2, volumePrecision: 0 })
        created.setPeriod({ type: 'minute', span: 1 })
        created.setDataLoader({
          getBars: ({ type, callback }) => {
            callback(type === 'init' ? bars : [], false)
            if (type === 'init') resolve()
          },
        })
      })
      created.createIndicator(
        { name: 'MA', calcParams: [...dataset.maPeriods], paneId: CANDLE_PANE_ID },
        true,
      )
      const plot = created.getSize(CANDLE_PANE_ID, 'main')
      if (!plot) throw new Error('KLineChart candle pane has no size')
      barSpace = plot.width / visibleBars
      created.setBarSpace(barSpace)
    },
    scrollOneBar() {
      mounted().scrollByDistance(barSpace, 0)
    },
    visibleRange(): VisibleRange {
      const range = mounted().getVisibleRange()
      return { from: range.from, to: range.to }
    },
    async destroy() {
      if (host) dispose(host)
      chart = null
      host = null
    },
  }
}
