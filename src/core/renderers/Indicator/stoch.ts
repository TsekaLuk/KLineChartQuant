import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { KDJ_COLORS } from '@/core/theme/colors'
import type { STOCHRenderState } from '@/core/indicators/stochState'
import { createSTOCHStateKey } from '@/core/indicators/stochState'

type LinePoint = { x: number; y: number }

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

    // 线条点缓存
    let cachedKey = ''
    let cachedKPoints: LinePoint[] = []
    let cachedDPoints: LinePoint[] = []

    function clearLineCache() {
        cachedKey = ''
        cachedKPoints = []
        cachedDPoints = []
    }

    function buildSTOCHCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: STOCHRenderState['params']
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
            pane.height.toFixed(2),
            params.showK,
            params.showD,
            params.n,
            params.m,
        ].join('|')
    }

    return {
        name: `stoch_${paneId}`,
        version: '2.0.0',
        description: 'STOCH 随机指标渲染器（WebGL + Canvas2D 回退）',
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
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context

            const state = pluginHost?.getSharedState<STOCHRenderState>(STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) {
                clearLineCache()
                return
            }

            const { valueMin, valueMax, params, series } = state
            const valueRange = valueMax - valueMin || 1

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线 80/20（虚线保持 Canvas 2D）
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

            ctx.restore()

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.n + params.m - 2)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildSTOCHCacheKey(range, kLineCenters, pane, params)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedKPoints = []
                cachedDPoints = []

                if (params.showK) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const point = series[i]
                        if (!point) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (point.k - displayMin) / displayValueRange * pane.height
                        cachedKPoints.push({ x: centerX, y: logicY })
                    }
                }

                if (params.showD) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const point = series[i]
                        if (!point) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (point.d - displayMin) / displayValueRange * pane.height
                        cachedDPoints.push({ x: centerX, y: logicY })
                    }
                }
            }

            // 绘制 STOCH 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                let allOk = true

                if (params.showK && cachedKPoints.length >= 2) {
                    allOk = lineWebGLSurface.drawLineStrip(
                        { points: cachedKPoints, width: 1 },
                        KDJ_COLORS.K,
                        scrollLeft
                    )
                }
                if (allOk && params.showD && cachedDPoints.length >= 2) {
                    allOk = lineWebGLSurface.drawLineStrip(
                        { points: cachedDPoints, width: 1 },
                        KDJ_COLORS.D,
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

            if (!usedWebGL) {
                drawSTOCHLinesWithCanvas2D(ctx, scrollLeft, cachedKPoints, cachedDPoints, params)
            }
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
 * 使用 Canvas 2D 绘制 STOCH 线（WebGL 回退）
 */
function drawSTOCHLinesWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    kPoints: LinePoint[],
    dPoints: LinePoint[],
    params: { showK: boolean; showD: boolean }
): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (params.showK && kPoints.length >= 2) {
        ctx.strokeStyle = KDJ_COLORS.K
        ctx.beginPath()
        ctx.moveTo(kPoints[0]!.x, kPoints[0]!.y)
        for (let i = 1; i < kPoints.length; i++) {
            const point = kPoints[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    if (params.showD && dPoints.length >= 2) {
        ctx.strokeStyle = KDJ_COLORS.D
        ctx.beginPath()
        ctx.moveTo(dPoints[0]!.x, dPoints[0]!.y)
        for (let i = 1; i < dPoints.length; i++) {
            const point = dPoints[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    ctx.restore()
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
