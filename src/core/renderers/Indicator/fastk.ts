import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { KDJ_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { FASTKRenderState } from '@/core/indicators/fastkState'
import { createFASTKStateKey } from '@/core/indicators/fastkState'

export interface FASTKRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 FASTK 渲染器插件
 */
export function createFASTKRendererPlugin(options: FASTKRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const STATE_KEY = createFASTKStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `fastk_${paneId}`,
        version: '2.0.0',
        description: 'FASTK 快速随机指标渲染器（无状态）',
        debugName: 'FASTK',
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

            const state = pluginHost?.getSharedState<FASTKRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            // 写回 valueMin/valueMax 供 scale 渲染器使用
            pluginHost?.setSharedState<FASTKRenderState>(STATE_KEY, state, `fastk_${paneId}`)

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线 80/20
            const y80 = pane.height - (80 - displayMin) / displayValueRange * pane.height
            const y20 = pane.height - (20 - displayMin) / displayValueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y80)
            ctx.lineTo(lineEndX, y80)
            ctx.moveTo(lineStartX, y20)
            ctx.lineTo(lineEndX, y20)
            ctx.stroke()
            ctx.setLineDash([])

            // 绘制 FASTK 线
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            if (params.showFASTK) {
                ctx.strokeStyle = KDJ_COLORS.K
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
            const state = pluginHost?.getSharedState<FASTKRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateFASTKConfig() 更新
        },
    }
}

/**
 * 获取 FASTK 标题信息（供 paneTitle 使用）
 */
export function getFASTKTitleInfo(
    index: number,
    period: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_FASTK'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<FASTKRenderState>(createFASTKStateKey(paneId))
    if (!state) return null

    const fastk = state.series[index]
    if (fastk === undefined) return null

    return {
        name: 'FASTK',
        params: [period],
        values: [
            { label: 'FASTK', value: fastk, color: KDJ_COLORS.K },
        ],
    }
}
