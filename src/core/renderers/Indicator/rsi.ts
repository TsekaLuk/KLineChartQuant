import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { RSI_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { RSIRenderState } from '@/core/indicators/rsiState'
import { createRSIStateKey } from '@/core/indicators/rsiState'

type LinePoint = { x: number; y: number }

export interface RSIRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 RSI 渲染器插件
 */
export function createRSIRendererPlugin(options: RSIRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    let pluginHost: PluginHost | null = null

    // 线条点缓存
    let cachedKey = ''
    let cachedRSI1Points: LinePoint[] = []
    let cachedRSI2Points: LinePoint[] = []
    let cachedRSI3Points: LinePoint[] = []

    function clearLineCache() {
        cachedKey = ''
        cachedRSI1Points = []
        cachedRSI2Points = []
        cachedRSI3Points = []
    }

    function buildRSICacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: RSIRenderState['params']
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
            params.showRSI1,
            params.showRSI2,
            params.showRSI3,
        ].join('|')
    }

    return {
        name: `rsi_${paneId}`,
        version: '2.0.0',
        description: 'RSI 相对强弱指标渲染器（WebGL + Canvas2D 回退）',
        debugName: 'RSI',
        paneId: paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [createRSIStateKey(paneId)]
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context

            // 从 StateStore 读取 RSI 状态
            const stateKey = createRSIStateKey(paneId)
            const state = pluginHost?.getSharedState<RSIRenderState>(stateKey)

            // 无有效数据时跳过渲染
            if (!state || state.visibleMin > state.visibleMax) {
                clearLineCache()
                return
            }

            const { valueMin, valueMax, params, series } = state

            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1

            // 绘制超买超卖线（80/50/20）- 仍使用 Canvas 2D
            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const y80 = pane.height - (80 - displayMin) / displayValueRange * pane.height
            const y50 = pane.height - (50 - displayMin) / displayValueRange * pane.height
            const y20 = pane.height - (20 - displayMin) / displayValueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y80)
            ctx.lineTo(lineEndX, y80)
            ctx.moveTo(lineStartX, y50)
            ctx.lineTo(lineEndX, y50)
            ctx.moveTo(lineStartX, y20)
            ctx.lineTo(lineEndX, y20)
            ctx.stroke()
            ctx.setLineDash([])

            ctx.restore()

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.period1)
            const drawEnd = Math.min(range.end, kLineCenters.length + range.start)

            // 更新线条缓存
            const cacheKey = buildRSICacheKey(range, kLineCenters, pane, params)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedRSI1Points = []
                cachedRSI2Points = []
                cachedRSI3Points = []

                if (params.showRSI1 && series[params.period1]) {
                    const data = series[params.period1]
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = data[i]
                        if (value === undefined) continue
                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue
                        const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                        cachedRSI1Points.push({ x: centerX, y: logicY })
                    }
                }

                if (params.showRSI2 && series[params.period2]) {
                    const data = series[params.period2]
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = data[i]
                        if (value === undefined) continue
                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue
                        const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                        cachedRSI2Points.push({ x: centerX, y: logicY })
                    }
                }

                if (params.showRSI3 && series[params.period3]) {
                    const data = series[params.period3]
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = data[i]
                        if (value === undefined) continue
                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue
                        const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                        cachedRSI3Points.push({ x: centerX, y: logicY })
                    }
                }
            }

            // 绘制 RSI 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                let allOk = true

                if (params.showRSI1 && cachedRSI1Points.length >= 2) {
                    allOk = lineWebGLSurface.drawLineStrip(
                        { points: cachedRSI1Points, width: 1 },
                        RSI_COLORS.RSI1,
                        scrollLeft
                    )
                }
                if (allOk && params.showRSI2 && cachedRSI2Points.length >= 2) {
                    allOk = lineWebGLSurface.drawLineStrip(
                        { points: cachedRSI2Points, width: 1 },
                        RSI_COLORS.RSI2,
                        scrollLeft
                    )
                }
                if (allOk && params.showRSI3 && cachedRSI3Points.length >= 2) {
                    allOk = lineWebGLSurface.drawLineStrip(
                        { points: cachedRSI3Points, width: 1 },
                        RSI_COLORS.RSI3,
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
                drawRSILinesWithCanvas2D(ctx, scrollLeft, cachedRSI1Points, cachedRSI2Points, cachedRSI3Points, params)
            }
        },

        getConfig() {
            const stateKey = createRSIStateKey(paneId)
            const state = pluginHost?.getSharedState<RSIRenderState>(stateKey)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器：配置变更请使用 chart.getIndicatorScheduler().updateRSIConfig()
        },
    }
}

/**
 * 获取 RSI 标题信息（供 paneTitle 使用）
 * 从 StateStore 读取已计算的 RSI 数据
 */
export function drawRSILinesWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    rsi1Points: LinePoint[],
    rsi2Points: LinePoint[],
    rsi3Points: LinePoint[],
    params: { showRSI1: boolean; showRSI2: boolean; showRSI3: boolean }
): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (params.showRSI1 && rsi1Points.length >= 2) {
        ctx.strokeStyle = RSI_COLORS.RSI1
        ctx.beginPath()
        ctx.moveTo(rsi1Points[0]!.x, rsi1Points[0]!.y)
        for (let i = 1; i < rsi1Points.length; i++) {
            const point = rsi1Points[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    if (params.showRSI2 && rsi2Points.length >= 2) {
        ctx.strokeStyle = RSI_COLORS.RSI2
        ctx.beginPath()
        ctx.moveTo(rsi2Points[0]!.x, rsi2Points[0]!.y)
        for (let i = 1; i < rsi2Points.length; i++) {
            const point = rsi2Points[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    if (params.showRSI3 && rsi3Points.length >= 2) {
        ctx.strokeStyle = RSI_COLORS.RSI3
        ctx.beginPath()
        ctx.moveTo(rsi3Points[0]!.x, rsi3Points[0]!.y)
        for (let i = 1; i < rsi3Points.length; i++) {
            const point = rsi3Points[i]!
            ctx.lineTo(point.x, point.y)
        }
        ctx.stroke()
    }

    ctx.restore()
}

function getRSITitleInfo(
    index: number,
    period1: number,
    period2: number,
    period3: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_RSI'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const stateKey = createRSIStateKey(paneId)
    const state = pluginHost.getSharedState<RSIRenderState>(stateKey)

    if (!state) return null

    const rsi1 = state.series[period1]?.[index]
    const rsi2 = state.series[period2]?.[index]
    const rsi3 = state.series[period3]?.[index]

    const values: Array<{ label: string; value: number; color: string }> = []
    if (rsi1 !== undefined) values.push({ label: `RSI${period1}`, value: rsi1, color: RSI_COLORS.RSI1 })
    if (rsi2 !== undefined) values.push({ label: `RSI${period2}`, value: rsi2, color: RSI_COLORS.RSI2 })
    if (rsi3 !== undefined) values.push({ label: `RSI${period3}`, value: rsi3, color: RSI_COLORS.RSI3 })

    if (values.length === 0) return null

    return {
        name: 'RSI',
        params: [period1, period2, period3],
        values,
    }
}
