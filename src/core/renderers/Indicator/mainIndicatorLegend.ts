import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { MA_STATE_KEY, type MARenderState } from '@/core/indicators/maState'
import { BOLL_STATE_KEY, type BOLLRenderState } from '@/core/indicators/bollState'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '@/core/indicators/expmaState'
import { ENE_STATE_KEY, type ENERenderState } from '@/core/indicators/eneState'
import { MA_COLORS, BOLL_COLORS, EXPMA_COLORS, ENE_COLORS, PRICE_COLORS } from '@/core/theme/colors'
import { getFont, setCanvasFont } from '@/core/theme/fonts'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 512

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}\n${text}`
  const cached = textWidthCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const width = ctx.measureText(text).width
  if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
    textWidthCache.clear()
  }
  textWidthCache.set(key, width)
  return width
}

/** 指标行数据 */
interface IndicatorRow {
  enabled: boolean
  params: Record<string, unknown>
}

/** 渲染器配置 */
interface MainIndicatorLegendConfig {
  yPaddingPx: number
  indicators: Record<string, IndicatorRow>
}

/**
 * 创建主图指标图例渲染器插件
 *
 * 统一管理 MA、BOLL 等主图指标的图例显示，支持多行排列
 * MA 数据从 StateStore 读取（与 MA 线渲染器共享同一数据源）
 */
export function createMainIndicatorLegendRendererPlugin(options: {
  yPaddingPx: number
}): RendererPluginWithHost {
  const config: MainIndicatorLegendConfig = {
    yPaddingPx: options.yPaddingPx,
    indicators: {
      MA: { enabled: true, params: {} },
      BOLL: { enabled: false, params: { period: 20, multiplier: 2 } },
      EXPMA: { enabled: false, params: { fastPeriod: 12, slowPeriod: 50 } },
      ENE: { enabled: false, params: { period: 10, deviation: 11 } },
    },
  }

  let pluginHost: PluginHost | null = null

  return {
    name: 'mainIndicatorLegend',
    version: '2.1.0',
    description: '主图指标图例渲染器（MA 数据来自 StateStore）',
    debugName: '主图指标图例',
    paneId: 'main',
    priority: RENDERER_PRIORITY.FOREGROUND,
    enabled: true,

    onInstall(host: PluginHost): void {
      pluginHost = host
    },

    getDeclaredNamespaces(): string[] {
      return [MA_STATE_KEY, BOLL_STATE_KEY, EXPMA_STATE_KEY, ENE_STATE_KEY]
    },

    draw(context: RenderContext) {
      const { ctx, data, range, crosshairIndex } = context
      const klineData = data as KLineData[]
      if (!klineData.length) return

      const fontSize = 12
      const lineHeight = fontSize + 6
      const legendX = 12
      const gap = 10

      ctx.save()
      setCanvasFont(ctx, getFont(fontSize))
      ctx.textAlign = 'left'

      const targetIndex = crosshairIndex ?? Math.min(range.end - 1, klineData.length - 1)
      const rows: Array<{ draw: (rowIndex: number) => void }> = []

      const maIndicator = config.indicators.MA
      if (maIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const items: Array<{ label: string; color: string; value?: number }> = []
            const state = pluginHost?.getSharedState<MARenderState>(MA_STATE_KEY)

            if (state && state.visibleMin <= state.visibleMax) {
              for (const period of state.enabledPeriods) {
                const colorKey = `MA${period}` as keyof typeof MA_COLORS
                const series = state.series[period]
                const value = series?.[targetIndex]

                items.push({
                  label: `MA${period}`,
                  color: MA_COLORS[colorKey] || MA_COLORS.MA5,
                  value: value,
                })
              }
            }

            if (items.length > 0) {
              let x = legendX
              const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight

              ctx.fillStyle = PRICE_COLORS.NEUTRAL
              ctx.fillText('MA', x, y)
              x += measureTextWidth(ctx, 'MA') + gap

              for (const it of items) {
                const valText = typeof it.value === 'number' ? ` ${it.value.toFixed(2)}` : ''
                const text = `${it.label}${valText}`
                ctx.fillStyle = it.color
                ctx.fillText(text, x, y)
                x += measureTextWidth(ctx, text) + gap
              }
            }
          }
        })
      }

      const bollIndicator = config.indicators.BOLL
      if (bollIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const bollState = pluginHost?.getSharedState<BOLLRenderState>(BOLL_STATE_KEY)
            const boll = bollState?.series[targetIndex]
            const period = bollState?.params.period ?? 20
            const multiplier = bollState?.params.multiplier ?? 2

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight
            const titleText = `BOLL(${period},${multiplier})`

            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(titleText, x, y)
            x += measureTextWidth(ctx, titleText) + gap

            if (boll) {
              const upperText = `上轨:${boll.upper.toFixed(2)}`
              ctx.fillStyle = BOLL_COLORS.UPPER
              ctx.fillText(upperText, x, y)
              x += measureTextWidth(ctx, upperText) + gap

              const middleText = `中轨:${boll.middle.toFixed(2)}`
              ctx.fillStyle = BOLL_COLORS.MIDDLE
              ctx.fillText(middleText, x, y)
              x += measureTextWidth(ctx, middleText) + gap

              const lowerText = `下轨:${boll.lower.toFixed(2)}`
              ctx.fillStyle = BOLL_COLORS.LOWER
              ctx.fillText(lowerText, x, y)
            }
          }
        })
      }

      const expmaIndicator = config.indicators.EXPMA
      if (expmaIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const expmaState = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)
            const expma = expmaState?.series[targetIndex]
            const fastPeriod = expmaState?.params.fastPeriod ?? 12
            const slowPeriod = expmaState?.params.slowPeriod ?? 50

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight
            const titleText = `EXPMA(${fastPeriod},${slowPeriod})`

            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(titleText, x, y)
            x += measureTextWidth(ctx, titleText) + gap

            if (expma) {
              const fastText = `快:${expma.fast.toFixed(2)}`
              ctx.fillStyle = EXPMA_COLORS.FAST
              ctx.fillText(fastText, x, y)
              x += measureTextWidth(ctx, fastText) + gap

              const slowText = `慢:${expma.slow.toFixed(2)}`
              ctx.fillStyle = EXPMA_COLORS.SLOW
              ctx.fillText(slowText, x, y)
            }
          }
        })
      }

      const eneIndicator = config.indicators.ENE
      if (eneIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const eneState = pluginHost?.getSharedState<ENERenderState>(ENE_STATE_KEY)
            const ene = eneState?.series[targetIndex]
            const period = eneState?.params.period ?? 10
            const deviation = eneState?.params.deviation ?? 11

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight
            const titleText = `ENE(${period},${deviation})`

            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(titleText, x, y)
            x += measureTextWidth(ctx, titleText) + gap

            if (ene) {
              const upperText = `上轨:${ene.upper.toFixed(2)}`
              ctx.fillStyle = ENE_COLORS.UPPER
              ctx.fillText(upperText, x, y)
              x += measureTextWidth(ctx, upperText) + gap

              const middleText = `中轨:${ene.middle.toFixed(2)}`
              ctx.fillStyle = ENE_COLORS.MIDDLE
              ctx.fillText(middleText, x, y)
              x += measureTextWidth(ctx, middleText) + gap

              const lowerText = `下轨:${ene.lower.toFixed(2)}`
              ctx.fillStyle = ENE_COLORS.LOWER
              ctx.fillText(lowerText, x, y)
            }
          }
        })
      }

      rows.forEach((row, index) => row.draw(index))
      ctx.restore()
    },

    getConfig() {
      return {
        yPaddingPx: config.yPaddingPx,
        indicators: { ...config.indicators },
      }
    },

    setConfig(newConfig: Record<string, unknown>) {
      if (typeof newConfig.yPaddingPx === 'number') {
        config.yPaddingPx = newConfig.yPaddingPx
      }
      if (newConfig.indicators && typeof newConfig.indicators === 'object') {
        for (const [id, row] of Object.entries(newConfig.indicators) as [string, IndicatorRow][]) {
          if (!config.indicators[id]) {
            config.indicators[id] = { enabled: false, params: {} }
          }
          if (row.enabled !== undefined) {
            config.indicators[id].enabled = row.enabled
          }
          if (row.params) {
            config.indicators[id].params = row.params
          }
        }
      }
    },
  }
}
