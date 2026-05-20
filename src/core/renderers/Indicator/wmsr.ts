import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { WMSR_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { WMSRRenderState } from '@/core/indicators/wmsrState'
import { createWMSRStateKey } from '@/core/indicators/wmsrState'

export interface WMSRRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 WMSR 渲染器插件
 */
export function createWMSRRendererPlugin(options: WMSRRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const STATE_KEY = createWMSRStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `wmsr_${paneId}`,
        version: '2.0.0',
        description: 'WMSR 威廉指标渲染器（无状态）',
        debugName: 'WMSR',
        paneId: paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [STATE_KEY]
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters } = context

            const state = pluginHost?.getSharedState<WMSRRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            // 写回 valueMin/valueMax 供 scale 渲染器使用
            pluginHost?.setSharedState<WMSRRenderState>(STATE_KEY, state, `wmsr_${paneId}`)

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线 -20 / -80 / -50
            const y20 = pane.height - (-20 - displayMin) / displayValueRange * pane.height
            const y80 = pane.height - (-80 - displayMin) / displayValueRange * pane.height
            const y50 = pane.height - (-50 - displayMin) / displayValueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = WMSR_COLORS.OVERBOUGHT
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y20)
            ctx.lineTo(lineEndX, y20)
            ctx.stroke()

            ctx.strokeStyle = WMSR_COLORS.OVERSOLD
            ctx.beginPath()
            ctx.moveTo(lineStartX, y80)
            ctx.lineTo(lineEndX, y80)
            ctx.stroke()

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.beginPath()
            ctx.moveTo(lineStartX, y50)
            ctx.lineTo(lineEndX, y50)
            ctx.stroke()
            ctx.setLineDash([])

            // 绘制 WMSR 线
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            if (params.showWMSR) {
                ctx.strokeStyle = WMSR_COLORS.WMSR
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const value = series[i]
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

            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<WMSRRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateWMSRConfig() 更新
        },
    }
}

/**
 * 获取 WMSR 标题信息（供 paneTitle 使用）
 */
export function getWMSRTitleInfo(
    index: number,
    period: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_WMSR'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<WMSRRenderState>(createWMSRStateKey(paneId))
    if (!state) return null

    const wmsr = state.series[index]
    if (wmsr === undefined) return null

    return {
        name: 'WMSR',
        params: [period],
        values: [
            { label: 'WMSR', value: wmsr, color: WMSR_COLORS.WMSR },
        ],
    }
}
