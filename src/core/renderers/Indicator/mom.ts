import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { MOM_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { MOMRenderState } from '@/core/indicators/momState'
import { createMOMStateKey } from '@/core/indicators/momState'

export interface MOMRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 MOM 渲染器插件
 */
export function createMOMRendererPlugin(options: MOMRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const STATE_KEY = createMOMStateKey(paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `mom_${paneId}`,
        version: '2.0.0',
        description: 'MOM 动量指标渲染器（无状态）',
        debugName: 'MOM',
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

            const state = pluginHost?.getSharedState<MOMRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) return

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            // 写回 valueMin/valueMax 供 scale 渲染器使用
            pluginHost?.setSharedState<MOMRenderState>(STATE_KEY, state, `mom_${paneId}`)

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            // 零轴位置
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制零轴
            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = MOM_COLORS.ZERO
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()

            // 绘制 MOM 线
            const drawStart = Math.max(range.start, params.period)
            const drawEnd = Math.min(range.end, series.length)

            if (params.showMOM) {
                ctx.strokeStyle = MOM_COLORS.MOM
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
            const state = pluginHost?.getSharedState<MOMRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateMOMConfig() 更新
        },
    }
}

/**
 * 获取 MOM 标题信息（供 paneTitle 使用）
 */
export function getMOMTitleInfo(
    index: number,
    period: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_MOM'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<MOMRenderState>(createMOMStateKey(paneId))
    if (!state) return null

    const mom = state.series[index]
    if (mom === undefined) return null

    return {
        name: 'MOM',
        params: [period],
        values: [
            { label: 'MOM', value: mom, color: MOM_COLORS.MOM },
        ],
    }
}
