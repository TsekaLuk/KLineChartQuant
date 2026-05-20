import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { CCI_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { CCIRenderState } from '@/core/indicators/cciState'
import { createCCIStateKey } from '@/core/indicators/cciState'

export interface CCIRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 CCI 渲染器插件
 */
export function createCCIRendererPlugin(options: CCIRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const STATE_KEY = createCCIStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `cci_${paneId}`,
        version: '2.0.0',
        description: 'CCI 顺势指标渲染器（无状态）',
        debugName: 'CCI',
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

            const state = pluginHost?.getSharedState<CCIRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            // 写回 valueMin/valueMax 供 scale 渲染器使用
            pluginHost?.setSharedState<CCIRenderState>(STATE_KEY, state, `cci_${paneId}`)

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            // 零轴位置
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线 +100/-100
            const y100 = pane.height - (100 - displayMin) / displayValueRange * pane.height
            const yNeg100 = pane.height - (-100 - displayMin) / displayValueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = CCI_COLORS.OVERBOUGHT
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y100)
            ctx.lineTo(lineEndX, y100)
            ctx.stroke()

            ctx.strokeStyle = CCI_COLORS.OVERSOLD
            ctx.beginPath()
            ctx.moveTo(lineStartX, yNeg100)
            ctx.lineTo(lineEndX, yNeg100)
            ctx.stroke()

            // 零轴
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()
            ctx.setLineDash([])

            // 绘制 CCI 线
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            if (params.showCCI) {
                ctx.strokeStyle = CCI_COLORS.CCI
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
            const state = pluginHost?.getSharedState<CCIRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateCCIConfig() 更新
        },
    }
}

/**
 * 获取 CCI 标题信息（供 paneTitle 使用）
 */
export function getCCITitleInfo(
    index: number,
    period: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_CCI'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<CCIRenderState>(createCCIStateKey(paneId))
    if (!state) return null

    const cci = state.series[index]
    if (cci === undefined) return null

    return {
        name: 'CCI',
        params: [period],
        values: [
            { label: 'CCI', value: cci, color: CCI_COLORS.CCI },
        ],
    }
}
