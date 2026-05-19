import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { MA_STATE_KEY, type MARenderState } from '@/core/indicators/maState'
import { BOLL_STATE_KEY, type BOLLRenderState } from '@/core/indicators/bollState'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '@/core/indicators/expmaState'
import { ENE_STATE_KEY, type ENERenderState } from '@/core/indicators/eneState'
import { MA_COLORS, BOLL_COLORS, EXPMA_COLORS, ENE_COLORS, PRICE_COLORS } from '@/core/theme/colors'

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
    version: '2.0.0',
    description: '主图指标图例渲染器（MA 数据来自 StateStore）',
    debugName: '主图指标图例',
    paneId: 'main',
    priority: RENDERER_PRIORITY.FOREGROUND,
    enabled: true,

    /**
     * 安装时捕获 PluginHost 引用
     */
    onInstall(host: PluginHost): void {
      pluginHost = host
    },

    /**
     * 声明使用的 StateStore 命名空间
     * MA/BOLL/EXPMA/ENE 图例与各指标线渲染器共享同一状态
     */
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
      ctx.font = `${fontSize}px Arial`
      ctx.textAlign = 'left'

      // 使用十字线指向的 K 线索引，无十字线时使用最后一根
      const targetIndex = crosshairIndex ?? Math.min(range.end - 1, klineData.length - 1)

      // 收集需要绘制的行
      const rows: Array<{ draw: (rowIndex: number) => void }> = []

      // MA 行 - 从 StateStore 读取数据
      const maIndicator = config.indicators.MA
      if (maIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            const items: Array<{ label: string; color: string; value?: number }> = []

            // 从 StateStore 读取 MA 状态
            const state = pluginHost?.getSharedState<MARenderState>(MA_STATE_KEY)

            if (state && state.visibleMin <= state.visibleMax) {
              // 按 enabledPeriods 顺序显示
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
              x += ctx.measureText('MA').width + gap

              for (const it of items) {
                const valText = typeof it.value === 'number' ? ` ${it.value.toFixed(2)}` : ''
                const text = `${it.label}${valText}`
                ctx.fillStyle = it.color
                ctx.fillText(text, x, y)
                x += ctx.measureText(text).width + gap
              }
            }
          }
        })
      }

      // BOLL 行 - 从 StateStore 读取数据
      const bollIndicator = config.indicators.BOLL
      if (bollIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            // 从 StateStore 读取 BOLL 状态
            const bollState = pluginHost?.getSharedState<BOLLRenderState>(BOLL_STATE_KEY)
            const boll = bollState?.series[targetIndex]
            const period = bollState?.params.period ?? 20
            const multiplier = bollState?.params.multiplier ?? 2

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight

            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(`BOLL(${period},${multiplier})`, x, y)
            x += ctx.measureText(`BOLL(${period},${multiplier})`).width + gap

            if (boll) {
              ctx.fillStyle = BOLL_COLORS.UPPER
              ctx.fillText(`上轨:${boll.upper.toFixed(2)}`, x, y)
              x += ctx.measureText(`上轨:${boll.upper.toFixed(2)}`).width + gap

              ctx.fillStyle = BOLL_COLORS.MIDDLE
              ctx.fillText(`中轨:${boll.middle.toFixed(2)}`, x, y)
              x += ctx.measureText(`中轨:${boll.middle.toFixed(2)}`).width + gap

              ctx.fillStyle = BOLL_COLORS.LOWER
              ctx.fillText(`下轨:${boll.lower.toFixed(2)}`, x, y)
            }
          }
        })
      }

      // EXPMA 行 - 从 StateStore 读取数据
      const expmaIndicator = config.indicators.EXPMA
      if (expmaIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            // 从 StateStore 读取 EXPMA 状态
            const expmaState = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)
            const expma = expmaState?.series[targetIndex]
            const fastPeriod = expmaState?.params.fastPeriod ?? 12
            const slowPeriod = expmaState?.params.slowPeriod ?? 50

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight

            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(`EXPMA(${fastPeriod},${slowPeriod})`, x, y)
            x += ctx.measureText(`EXPMA(${fastPeriod},${slowPeriod})`).width + gap

            if (expma) {
              ctx.fillStyle = EXPMA_COLORS.FAST
              ctx.fillText(`快:${expma.fast.toFixed(2)}`, x, y)
              x += ctx.measureText(`快:${expma.fast.toFixed(2)}`).width + gap

              ctx.fillStyle = EXPMA_COLORS.SLOW
              ctx.fillText(`慢:${expma.slow.toFixed(2)}`, x, y)
            }
          }
        })
      }

      // ENE 行 - 从 StateStore 读取数据
      const eneIndicator = config.indicators.ENE
      if (eneIndicator?.enabled) {
        rows.push({
          draw: (rowIndex: number) => {
            // 从 StateStore 读取 ENE 状态
            const eneState = pluginHost?.getSharedState<ENERenderState>(ENE_STATE_KEY)
            const ene = eneState?.series[targetIndex]
            const period = eneState?.params.period ?? 10
            const deviation = eneState?.params.deviation ?? 11

            let x = legendX
            const y = config.yPaddingPx / 2 + fontSize + rowIndex * lineHeight

            ctx.fillStyle = PRICE_COLORS.NEUTRAL
            ctx.fillText(`ENE(${period},${deviation})`, x, y)
            x += ctx.measureText(`ENE(${period},${deviation})`).width + gap

            if (ene) {
              ctx.fillStyle = ENE_COLORS.UPPER
              ctx.fillText(`上轨:${ene.upper.toFixed(2)}`, x, y)
              x += ctx.measureText(`上轨:${ene.upper.toFixed(2)}`).width + gap

              ctx.fillStyle = ENE_COLORS.MIDDLE
              ctx.fillText(`中轨:${ene.middle.toFixed(2)}`, x, y)
              x += ctx.measureText(`中轨:${ene.middle.toFixed(2)}`).width + gap

              ctx.fillStyle = ENE_COLORS.LOWER
              ctx.fillText(`下轨:${ene.lower.toFixed(2)}`, x, y)
            }
          }
        })
      }

      // 按顺序绘制所有行
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
        // 合并而非替换，保留其他指标的配置
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
