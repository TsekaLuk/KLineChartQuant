import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { WMSR_COLORS } from '@/core/theme/colors'
import type { WMSRRenderState } from '@/core/indicators/wmsrState'
import { createWMSRStateKey } from '@/core/indicators/wmsrState'

type LinePoint = { x: number; y: number }

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

    // 线条点缓存
    let cachedKey = ''
    let cachedWMSRPoints: LinePoint[] = []

    function clearLineCache() {
        cachedKey = ''
        cachedWMSRPoints = []
    }

    function buildWMSRCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: WMSRRenderState['params']
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
            params.showWMSR,
            params.period,
        ].join('|')
    }

    return {
        name: `wmsr_${paneId}`,
        version: '2.0.0',
        description: 'WMSR 威廉指标渲染器（WebGL + Canvas2D 回退）',
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
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context

            const state = pluginHost?.getSharedState<WMSRRenderState>(STATE_KEY)
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

            // 绘制超买超卖线 -20 / -80 / -50（虚线保持 Canvas 2D）
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

            ctx.restore()

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildWMSRCacheKey(range, kLineCenters, pane, params)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedWMSRPoints = []

                if (params.showWMSR) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = series[i]
                        if (value === undefined) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                        cachedWMSRPoints.push({ x: centerX, y: logicY })
                    }
                }
            }

            // 绘制 WMSR 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                if (params.showWMSR && cachedWMSRPoints.length >= 2) {
                    const ok = lineWebGLSurface.drawLineStrip(
                        { points: cachedWMSRPoints, width: 1 },
                        WMSR_COLORS.WMSR,
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
                drawWMSRLineWithCanvas2D(ctx, scrollLeft, cachedWMSRPoints, params)
            }
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
 * 使用 Canvas 2D 绘制 WMSR 线（WebGL 回退）
 */
function drawWMSRLineWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    wmsrPoints: LinePoint[],
    params: { showWMSR: boolean }
): void {
    if (!params.showWMSR || wmsrPoints.length < 2) return

    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.strokeStyle = WMSR_COLORS.WMSR
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(wmsrPoints[0]!.x, wmsrPoints[0]!.y)
    for (let i = 1; i < wmsrPoints.length; i++) {
        const point = wmsrPoints[i]!
        ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()
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
