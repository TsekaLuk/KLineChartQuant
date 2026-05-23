import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { EXPMA_COLORS } from '@/core/theme/colors'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '@/core/indicators/expmaState'

function buildEXPMACacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane']
): string {
    const dr = pane.yAxis.getDisplayRange()
    return [
        range.start,
        range.end,
        kLineCenters.length,
        kLineCenters[0]?.toFixed(2) ?? 'n',
        kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
        dr.maxPrice.toFixed(6),
        dr.minPrice.toFixed(6),
        pane.yAxis.getPriceOffset().toFixed(6),
        pane.yAxis.getScaleType(),
    ].join('|')
}

/**
 * 创建 EXPMA（指数平滑移动平均线）渲染器插件（带绘制缓存）
 */
export function createEXPMARendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null
    let cachedKey = ''
    let cachedFastPath: Path2D | null = null
    let cachedSlowPath: Path2D | null = null

    function clearCache() {
        cachedKey = ''
        cachedFastPath = null
        cachedSlowPath = null
    }

    return {
        name: 'expma',
        version: '2.0.0',
        description: 'EXPMA 指数平滑移动平均线渲染器（带绘制缓存）',
        debugName: 'EXPMA',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        onInstall(host: PluginHost): void {
            pluginHost = host
        },

        getDeclaredNamespaces(): string[] {
            return [EXPMA_STATE_KEY]
        },

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]
            const state = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)

            if (!state || state.visibleMin > state.visibleMax) {
                clearCache()
                return
            }
            if (state.series.length === 0 || klineData.length < 2) {
                clearCache()
                return
            }

            const expmaData = state.series
            const drawStart = range.start
            const drawEnd = Math.min(range.end, klineData.length)
            const cacheKey = buildEXPMACacheKey(range, kLineCenters, pane)

            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedFastPath = new Path2D()
                cachedSlowPath = new Path2D()
                let fastStarted = false
                let slowStarted = false

                for (let i = drawStart; i < drawEnd; i++) {
                    const expma = expmaData[i]
                    if (!expma) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue

                    const fastY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(expma.fast), dpr)
                    const slowY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(expma.slow), dpr)

                    if (!fastStarted) {
                        cachedFastPath.moveTo(centerX, fastY)
                        fastStarted = true
                    } else {
                        cachedFastPath.lineTo(centerX, fastY)
                    }

                    if (!slowStarted) {
                        cachedSlowPath.moveTo(centerX, slowY)
                        slowStarted = true
                    } else {
                        cachedSlowPath.lineTo(centerX, slowY)
                    }
                }

                if (!fastStarted) cachedFastPath = null
                if (!slowStarted) cachedSlowPath = null
            }

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            if (cachedFastPath) {
                ctx.strokeStyle = EXPMA_COLORS.FAST
                ctx.stroke(cachedFastPath)
            }

            if (cachedSlowPath) {
                ctx.strokeStyle = EXPMA_COLORS.SLOW
                ctx.stroke(cachedSlowPath)
            }

            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
            // 外部控制器应调用 chart.getIndicatorScheduler().updateEXPMAConfig()
        },
    }
}
