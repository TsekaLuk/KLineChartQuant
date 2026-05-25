import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { MOM_COLORS } from '@/core/theme/colors'
import type { MOMRenderState } from '@/core/indicators/momState'
import { createMOMStateKey } from '@/core/indicators/momState'

type LinePoint = { x: number; y: number }

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

    // 线条点缓存
    let cachedKey = ''
    let cachedMOMPoints: LinePoint[] = []

    function clearLineCache() {
        cachedKey = ''
        cachedMOMPoints = []
    }

    function buildMOMCacheKey(
        range: { start: number; end: number },
        kLineCenters: number[],
        pane: RenderContext['pane'],
        params: MOMRenderState['params']
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
            params.showMOM,
            params.period,
        ].join('|')
    }

    return {
        name: `mom_${paneId}`,
        version: '2.0.0',
        description: 'MOM 动量指标渲染器（WebGL + Canvas2D 回退）',
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
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context

            const state = pluginHost?.getSharedState<MOMRenderState>(STATE_KEY)
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

            // 绘制零轴（实线，保持 Canvas 2D）
            const lineStartX = scrollLeft
            const lineEndX = scrollLeft + context.paneWidth

            ctx.strokeStyle = MOM_COLORS.ZERO
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(lineStartX, zeroY)
            ctx.lineTo(lineEndX, zeroY)
            ctx.stroke()

            ctx.restore()

            // 确定绘制范围
            const drawStart = Math.max(range.start, params.period)
            const drawEnd = Math.min(range.end, series.length)

            // 更新线条缓存
            const cacheKey = buildMOMCacheKey(range, kLineCenters, pane, params)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedMOMPoints = []

                if (params.showMOM) {
                    for (let i = drawStart; i < drawEnd; i++) {
                        const value = series[i]
                        if (value === undefined) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const logicY = pane.height - (value - displayMin) / displayValueRange * pane.height
                        cachedMOMPoints.push({ x: centerX, y: logicY })
                    }
                }
            }

            // 绘制 MOM 线（WebGL 优先，Canvas2D 回退）
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                if (params.showMOM && cachedMOMPoints.length >= 2) {
                    const ok = lineWebGLSurface.drawLineStrip(
                        { points: cachedMOMPoints, width: 1 },
                        MOM_COLORS.MOM,
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
                drawMOMLineWithCanvas2D(ctx, scrollLeft, cachedMOMPoints, params)
            }
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
 * 使用 Canvas 2D 绘制 MOM 线（WebGL 回退）
 */
function drawMOMLineWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    momPoints: LinePoint[],
    params: { showMOM: boolean }
): void {
    if (!params.showMOM || momPoints.length < 2) return

    ctx.save()
    ctx.translate(-scrollLeft, 0)
    ctx.strokeStyle = MOM_COLORS.MOM
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(momPoints[0]!.x, momPoints[0]!.y)
    for (let i = 1; i < momPoints.length; i++) {
        const point = momPoints[i]!
        ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
    ctx.restore()
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
