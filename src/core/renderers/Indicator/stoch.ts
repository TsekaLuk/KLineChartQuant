import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { KDJ_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { STOCHRenderState } from '@/core/indicators/stochState'
import { createSTOCHStateKey } from '@/core/indicators/stochState'

export interface STOCHRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 STOCH 渲染器插件
 */
export function createSTOCHRendererPlugin(options: STOCHRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const STATE_KEY = createSTOCHStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `stoch_${paneId}`,
        version: '2.0.0',
        description: 'STOCH 随机指标渲染器（无状态）',
        debugName: 'STOCH',
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

            const state = pluginHost?.getSharedState<STOCHRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            // 写回 valueMin/valueMax 供 scale 渲染器使用
            pluginHost?.setSharedState<STOCHRenderState>(STATE_KEY, state, `stoch_${paneId}`)

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

            const drawStart = Math.max(range.start, params.n + params.m - 2)
            const drawEnd = Math.min(range.end, series.length)

            // 绘制 K 线
            if (params.showK) {
                ctx.strokeStyle = KDJ_COLORS.K
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = series[i]
                    if (!point) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.height - (point.k - displayMin) / displayValueRange * pane.height

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

            // 绘制 D 线
            if (params.showD) {
                ctx.strokeStyle = KDJ_COLORS.D
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const point = series[i]
                    if (!point) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.height - (point.d - displayMin) / displayValueRange * pane.height

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
            const state = pluginHost?.getSharedState<STOCHRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateSTOCHConfig() 更新
        },
    }
}

/**
 * 获取 STOCH 标题信息（供 paneTitle 使用）
 */
export function getSTOCHTitleInfo(
    index: number,
    n: number,
    m: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_STOCH'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<STOCHRenderState>(createSTOCHStateKey(paneId))
    if (!state) return null

    const point = state.series[index]
    if (!point || point.k === undefined) return null

    const values = []
    if (state.params.showK) values.push({ label: 'K', value: point.k, color: KDJ_COLORS.K })
    if (state.params.showD) values.push({ label: 'D', value: point.d, color: KDJ_COLORS.D })

    if (values.length === 0) return null

    return {
        name: 'STOCH',
        params: [n, m],
        values,
    }
}
