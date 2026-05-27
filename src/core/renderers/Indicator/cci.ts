import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { CCI_COLORS } from '@/core/theme/colors'
import type { CCIRenderState } from '@/core/indicators/cciState'
import { createCCIStateKey } from '@/core/indicators/cciState'

type LinePoint = { x: number; y: number }

export interface CCIRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

/**
 * 创建 CCI 渲染器插件
 */
export function createCCIRendererPlugin(options: CCIRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const STATE_KEY = createCCIStateKey(paneId)
    let pluginHost: PluginHost | null = null

    // 线条点缓存
    let cachedKey = ''
    let cachedCCIPoints: LinePoint[] = []

    function clearLineCache() {
        cachedKey = ''
        cachedCCIPoints = []
    }

    function buildCCICacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: CCIRenderState['params']
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
            params.showCCI,
            params.period,
        ].join('|')
    }

    return {
        name: `cci_${paneId}`,
        version: '2.1.0',
        description: 'CCI 顺势指标渲染器（WebGL + Canvas2D 回退）',
        debugName: 'CCI',
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

            const state = pluginHost?.getSharedState<CCIRenderState>(STATE_KEY)
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

            // 零轴位置
            const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制超买超卖线 +100/-100（虚线保持 Canvas 2D）
            const y100 = pane.height - (100 - displayMin) / displayValueRange * pane.height
            const yNeg100 = pane.height - (-100 - displayMin) / displayValueRange * pane.height

            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = CCI_COLORS.OVERBOUGHT
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(lineStartX, y100)
            ctx.lineTo(lineEndX, y100)
            ctx.stroke()

            ctx.strokeStyle = CCI_COLORS.OVERSOLD
            ctx.beginPath()
            ctx.moveTo(lineStartX, yNeg100)
            ctx.lineTo(lineEndX, yNeg100)
            ctx.stroke()

            // 零轴
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)'
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()
            ctx.setLineDash([])

            ctx.restore()

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.period - 1)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildCCICacheKey(range, kLineCenters, pane, params)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedCCIPoints = []

                if (params.showCCI) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = series[i]
                        if (value === undefined) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                        cachedCCIPoints.push({ x: centerX, y: logicY })
                    }
                }
            }

            // 绘制 CCI 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                if (params.showCCI && cachedCCIPoints.length >= 2) {
                    const ok = lineWebGLSurface.drawLineStrips(
                        [{ points: cachedCCIPoints, width: 1, color: CCI_COLORS.CCI }],
                        scrollLeft
                    )
                    if (ok) {
                        usedWebGL = true
                        lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                    }
                }
            }

            if (!usedWebGL) {
                drawCCILineWithCanvas2D(ctx, scrollLeft, cachedCCIPoints, params)
            }
        },

        getConfig() {
            const state = pluginHost?.getSharedState<CCIRenderState>(STATE_KEY)
            return state?.params ?? {}
        },

        setConfig() {
            // no-op: 配置通过 scheduler.updateCCIConfig() 更新
        },
    }
}

/**
 * 使用 Canvas 2D 绘制 CCI 线（WebGL 回退）
 */
function drawCCILineWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    cciPoints: LinePoint[],
    params: { showCCI: boolean }
): void {
    if (!params.showCCI || cciPoints.length < 2) return

    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.strokeStyle = CCI_COLORS.CCI
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cciPoints[0]!.x, cciPoints[0]!.y)
    for (let i = 1; i < cciPoints.length; i++) {
        const point = cciPoints[i]!
        ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()
}

/**
 * 获取 CCI 标题信息（供 paneTitle 使用）
 */
export function getCCITitleInfo(
    index: number,
    period: number,
    pluginHost: PluginHost,
    paneId: string = 'sub_CCI'
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
    const state = pluginHost.getSharedState<CCIRenderState>(createCCIStateKey(paneId))
    if (!state) return null

    const cci = state.series[index]
    if (cci === undefined) return null

    return {
        name: 'CCI',
        params: [period],
        values: [
            { label: 'CCI', value: cci, color: CCI_COLORS.CCI },
        ],
    }
}
