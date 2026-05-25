import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { KDJ_COLORS } from '@/core/theme/colors'
import type { FASTKRenderState } from '@/core/indicators/fastkState'
import { createFASTKStateKey } from '@/core/indicators/fastkState'

type LinePoint = { x: number; y: number }

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

    // 线条点缓存
    let cachedKey = ''
    let cachedFASTKPoints: LinePoint[] = []

    function clearLineCache() {
        cachedKey = ''
        cachedFASTKPoints = []
    }

    function buildFASTKCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: FASTKRenderState['params']
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
            params.showFASTK,
            params.period,
        ].join('|')
    }

    return {
        name: `fastk_${paneId}`,
        version: '2.0.0',
        description: 'FASTK 快速随机指标渲染器（WebGL + Canvas2D 回退）',
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
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context

            const state = pluginHost?.getSharedState<FASTKRenderState>(STATE_KEY)
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
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildFASTKCacheKey(range, kLineCenters, pane, params)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedFASTKPoints = []

                if (params.showFASTK) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = series[i]
                        if (value === undefined) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                        cachedFASTKPoints.push({ x: centerX, y: logicY })
                    }
                }
            }

            // 绘制 FASTK 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                if (params.showFASTK && cachedFASTKPoints.length >= 2) {
                    const ok = lineWebGLSurface.drawLineStrip(
                        { points: cachedFASTKPoints, width: 1 },
                        KDJ_COLORS.K,
                        scrollLeft
                    )
                    if (ok) {
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
            }

            if (!usedWebGL) {
                drawFASTKLineWithCanvas2D(ctx, scrollLeft, cachedFASTKPoints, params)
            }
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
 * 使用 Canvas 2D 绘制 FASTK 线（WebGL 回退）
 */
function drawFASTKLineWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    fastkPoints: LinePoint[],
    params: { showFASTK: boolean }
): void {
    if (!params.showFASTK || fastkPoints.length < 2) return

    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.strokeStyle = KDJ_COLORS.K
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(fastkPoints[0]!.x, fastkPoints[0]!.y)
    for (let i = 1; i < fastkPoints.length; i++) {
        const point = fastkPoints[i]!
        ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()
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
