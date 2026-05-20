import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { KST_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { KSTRenderState } from '@/core/indicators/kstState'
import { createKSTStateKey } from '@/core/indicators/kstState'

export interface KSTRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 KST 渲染器插件
 */
export function createKSTRendererPlugin(options: KSTRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const STATE_KEY = createKSTStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `kst_${paneId}`,
        version: '2.0.0',
        description: 'KST 确知指标渲染器（无状态）',
        debugName: 'KST',
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

            const state = pluginHost?.getSharedState<KSTRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            // 写回 valueMin/valueMax 供 scale 渲染器使用
            pluginHost?.setSharedState<KSTRenderState>(STATE_KEY, state, `kst_${paneId}`)

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制零轴
            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()

            const drawStart = Math.max(range.start, params.roc4 + 15 + params.signalPeriod - 1)
            const drawEnd = Math.min(range.end, series.length)

            // 绘制 KST 线
            if (params.showKST) {
                ctx.strokeStyle = KST_COLORS.KST
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
                    const logicY = pane.height - (point.kst - displayMin) / displayValueRange * pane.height

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

            // 绘制信号线
            if (params.showSignal) {
                ctx.strokeStyle = KST_COLORS.SIGNAL
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
                    const logicY = pane.height - (point.signal - displayMin) / displayValueRange * pane.height

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
            const state = pluginHost?.getSharedState<KSTRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateKSTConfig() 更新
        },
    }
}

/**
 * 获取 KST 标题信息（供 paneTitle 使用）
 */
export function getKSTTitleInfo(
    index: number,
    roc1: number,
    roc2: number,
    roc3: number,
    roc4: number,
    signalPeriod: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_KST'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<KSTRenderState>(createKSTStateKey(paneId))
    if (!state) return null

    const point = state.series[index]
    if (!point) return null

    const values = []
    if (state.params.showKST) values.push({ label: 'KST', value: point.kst, color: KST_COLORS.KST })
    if (state.params.showSignal) values.push({ label: 'Signal', value: point.signal, color: KST_COLORS.SIGNAL })

    if (values.length === 0) return null

    return {
        name: 'KST',
        params: [roc1, roc2, roc3, roc4, signalPeriod],
        values,
    }
}
