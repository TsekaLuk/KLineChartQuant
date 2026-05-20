import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { RSI_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { RSIRenderState } from '@/core/indicators/rsiState'
import { createRSIStateKey } from '@/core/indicators/rsiState'


export interface RSIRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 RSI 渲染器插件
 */
export function createRSIRendererPlugin(options: RSIRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    return {
        name: `rsi_${paneId}`,
        version: '2.0.0',
        description: 'RSI 相对强弱指标渲染器（无状态）',
        debugName: 'RSI',
        paneId: paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [createRSIStateKey(paneId)]
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context

            // 从 StateStore 读取 RSI 状态
            const stateKey = createRSIStateKey(paneId)
            const state = pluginHost?.getSharedState<RSIRenderState>(stateKey)

            // 无有效数据时跳过渲染
            if (!state || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线（80/50/20）
            const y80 = pane.height - (80 - displayMin) / displayValueRange * pane.height
            const y50 = pane.height - (50 - displayMin) / displayValueRange * pane.height
            const y20 = pane.height - (20 - displayMin) / displayValueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y80)
            ctx.lineTo(lineEndX, y80)
            ctx.moveTo(lineStartX, y50)
            ctx.lineTo(lineEndX, y50)
            ctx.moveTo(lineStartX, y20)
            ctx.lineTo(lineEndX, y20)
            ctx.stroke()
            ctx.setLineDash([])

            // 确定绘制范围（使用最小周期作为起始）
            const drawStart = Math.max(range.start, params.period1)
            const drawEnd = Math.min(range.end, kLineCenters.length + range.start)

            const drawLine = (data: (number | undefined)[], color: string) => {
                ctx.strokeStyle = color
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = data[i]
                    if (value === undefined) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height

                    const px = centerX
                    const py = alignToPhysicalPixelCenter(logicY, dpr)

                    if (isFirst) {
                        ctx.moveTo(px, py)
                        isFirst = false
                    } else {
                        ctx.lineTo(px, py)
                    }
                }
                ctx.stroke()
            }

            // 根据 show 标志绘制各周期 RSI 线
            if (params.showRSI1 && series[params.period1]) {
                drawLine(series[params.period1], RSI_COLORS.RSI1)
            }
            if (params.showRSI2 && series[params.period2]) {
                drawLine(series[params.period2], RSI_COLORS.RSI2)
            }
            if (params.showRSI3 && series[params.period3]) {
                drawLine(series[params.period3], RSI_COLORS.RSI3)
            }

            ctx.restore()
        },

        getConfig() {
            const stateKey = createRSIStateKey(paneId)
            const state = pluginHost?.getSharedState<RSIRenderState>(stateKey)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器：配置变更请使用 chart.getIndicatorScheduler().updateRSIConfig()
        },
    }
}

/**
 * 获取 RSI 标题信息（供 paneTitle 使用）
 * 从 StateStore 读取已计算的 RSI 数据
 */
export function getRSITitleInfo(
    index: number,
    period1: number,
    period2: number,
    period3: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_RSI'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const stateKey = createRSIStateKey(paneId)
    const state = pluginHost.getSharedState<RSIRenderState>(stateKey)

    if (!state) return null

    const rsi1 = state.series[period1]?.[index]
    const rsi2 = state.series[period2]?.[index]
    const rsi3 = state.series[period3]?.[index]

    const values: Array<{ label: string; value: number; color: string }> = []
    if (rsi1 !== undefined) values.push({ label: `RSI${period1}`, value: rsi1, color: RSI_COLORS.RSI1 })
    if (rsi2 !== undefined) values.push({ label: `RSI${period2}`, value: rsi2, color: RSI_COLORS.RSI2 })
    if (rsi3 !== undefined) values.push({ label: `RSI${period3}`, value: rsi3, color: RSI_COLORS.RSI3 })

    if (values.length === 0) return null

    return {
        name: 'RSI',
        params: [period1, period2, period3],
        values,
    }
}
