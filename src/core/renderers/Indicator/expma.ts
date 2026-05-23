import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { EXPMA_COLORS } from '@/core/theme/colors'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '@/core/indicators/expmaState'

type LinePoint = { x: number; y: number }

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

export function createEXPMARendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null
    let cachedKey = ''
    let cachedFastPoints: LinePoint[] = []
    let cachedSlowPoints: LinePoint[] = []

    function clearCache() {
        cachedKey = ''
        cachedFastPoints = []
        cachedSlowPoints = []
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
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context
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
                cachedFastPoints = []
                cachedSlowPoints = []

                for (let i = drawStart; i < drawEnd; i++) {
                    const expma = expmaData[i]
                    if (!expma) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue

                    cachedFastPoints.push({ x: centerX, y: pane.yAxis.priceToY(expma.fast) })
                    cachedSlowPoints.push({ x: centerX, y: pane.yAxis.priceToY(expma.slow) })
                }
            }

            let usedWebGL = false
            if (lineWebGLSurface?.isAvailable()) {
                let allOk = true
                if (cachedFastPoints.length >= 2) {
                    allOk = lineWebGLSurface.drawLineStrip(
                        { points: cachedFastPoints, width: 1 },
                        EXPMA_COLORS.FAST,
                        scrollLeft
                    )
                }
                if (allOk && cachedSlowPoints.length >= 2) {
                    allOk = lineWebGLSurface.drawLineStrip(
                        { points: cachedSlowPoints, width: 1 },
                        EXPMA_COLORS.SLOW,
                        scrollLeft
                    )
                }

                if (allOk) {
                    usedWebGL = true
                    const canvas = lineWebGLSurface.getCanvas()
                    if (canvas.width > 0 && canvas.height > 0) {
                        const prevImageSmoothingEnabled = ctx.imageSmoothingEnabled
                        ctx.imageSmoothingEnabled = false
                        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width / dpr, canvas.height / dpr)
                        ctx.imageSmoothingEnabled = prevImageSmoothingEnabled
                    }
                }
            }

            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            if (cachedFastPoints.length >= 2) {
                ctx.strokeStyle = EXPMA_COLORS.FAST
                ctx.beginPath()
                ctx.moveTo(cachedFastPoints[0]!.x, cachedFastPoints[0]!.y)
                for (let i = 1; i < cachedFastPoints.length; i++) {
                    const point = cachedFastPoints[i]!
                    ctx.lineTo(point.x, point.y)
                }
                ctx.stroke()
            }

            if (cachedSlowPoints.length >= 2) {
                ctx.strokeStyle = EXPMA_COLORS.SLOW
                ctx.beginPath()
                ctx.moveTo(cachedSlowPoints[0]!.x, cachedSlowPoints[0]!.y)
                for (let i = 1; i < cachedSlowPoints.length; i++) {
                    const point = cachedSlowPoints[i]!
                    ctx.lineTo(point.x, point.y)
                }
                ctx.stroke()
            }

            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
        },
    }
}
