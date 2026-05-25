import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { BOLL_COLORS } from '@/core/theme/colors'
import { BOLL_STATE_KEY, type BOLLRenderState } from '@/core/indicators/bollState'

type LinePoint = { x: number; y: number }

function buildBOLLCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    showUpper: boolean,
    showMiddle: boolean,
    showLower: boolean,
    showBand: boolean,
    period: number
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
        Number(showUpper),
        Number(showMiddle),
        Number(showLower),
        Number(showBand),
        period,
        pane.height.toFixed(2),
    ].join('|')
}


function getRgbaAlpha(color: string): number {
    const match = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i)
    if (!match) return 1
    const alpha = Number(match[1])
    return Number.isFinite(alpha) ? alpha : 1
}

function toOpaqueRgba(color: string): string {
    return color.replace(/,\s*[\d.]+\s*\)$/i, ', 1)')
}

function compositeLineSurface(
    context: RenderContext,
    surface: NonNullable<RenderContext['lineWebGLSurface']>,
    alpha = 1
): void {
    const canvas = surface.getCanvas()
    if (canvas.width <= 0 || canvas.height <= 0) return

    const prevImageSmoothingEnabled = context.ctx.imageSmoothingEnabled
    const prevGlobalAlpha = context.ctx.globalAlpha
    context.ctx.imageSmoothingEnabled = false
    context.ctx.globalAlpha = prevGlobalAlpha * alpha
    context.ctx.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width / context.dpr,
        canvas.height / context.dpr
    )
    context.ctx.globalAlpha = prevGlobalAlpha
    context.ctx.imageSmoothingEnabled = prevImageSmoothingEnabled
}

function drawBOLLWithWebGL(
    context: RenderContext,
    data: {
        showUpper: boolean
        showMiddle: boolean
        showLower: boolean
        showBand: boolean
        upperPoints: LinePoint[]
        middlePoints: LinePoint[]
        lowerPoints: LinePoint[]
        bandUpperPoints: LinePoint[]
        bandLowerPoints: LinePoint[]
    }
): boolean {
    if (context.settings?.enableWebGLRendering === false) return false
    const surface = context.lineWebGLSurface
    if (!surface || !surface.isAvailable()) return false

    surface.clear()

    let allOk = true
    if (data.showBand && data.bandUpperPoints.length >= 2 && data.bandLowerPoints.length >= 2) {
        surface.clear()
        allOk = surface.drawFilledBand(
            { upperPoints: data.bandUpperPoints, lowerPoints: data.bandLowerPoints },
            toOpaqueRgba(BOLL_COLORS.BAND_FILL),
            context.scrollLeft
        )
        if (allOk) {
            compositeLineSurface(context, surface, getRgbaAlpha(BOLL_COLORS.BAND_FILL))
        }
    }
    surface.clear()

    const lineStrips: Array<{ points: LinePoint[]; width: number; color: string }> = []
    if (data.showUpper && data.upperPoints.length >= 2) {
        lineStrips.push({ points: data.upperPoints, width: 1, color: BOLL_COLORS.UPPER })
    }
    if (data.showMiddle && data.middlePoints.length >= 2) {
        lineStrips.push({ points: data.middlePoints, width: 1, color: BOLL_COLORS.MIDDLE })
    }
    if (data.showLower && data.lowerPoints.length >= 2) {
        lineStrips.push({ points: data.lowerPoints, width: 1, color: BOLL_COLORS.LOWER })
    }

    if (lineStrips.length > 0) {
        allOk = surface.drawLineStrips(lineStrips, context.scrollLeft)
    }
    if (!allOk) {
        surface.clear()
        return false
    }

    const canvas = surface.getCanvas()
    if (canvas.width <= 0 || canvas.height <= 0) {
        surface.clear()
        return true
    }

    compositeLineSurface(context, surface)
    surface.clear()
    return true
}

export function createBOLLRendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null
    let cachedKey = ''
    let cachedBandPath: Path2D | null = null
    let cachedUpperPath: Path2D | null = null
    let cachedMiddlePath: Path2D | null = null
    let cachedLowerPath: Path2D | null = null
    let cachedUpperPoints: LinePoint[] = []
    let cachedMiddlePoints: LinePoint[] = []
    let cachedLowerPoints: LinePoint[] = []
    let cachedBandUpperPoints: LinePoint[] = []
    let cachedBandLowerPoints: LinePoint[] = []

    function clearCache() {
        cachedKey = ''
        cachedBandPath = null
        cachedUpperPath = null
        cachedMiddlePath = null
        cachedLowerPath = null
        cachedUpperPoints = []
        cachedMiddlePoints = []
        cachedLowerPoints = []
        cachedBandUpperPoints = []
        cachedBandLowerPoints = []
    }

    return {
        name: 'boll',
        version: '2.0.0',
        description: '布林带渲染器（带绘制缓存）',
        debugName: 'BOLL布林带',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        onInstall(host: PluginHost): void {
            pluginHost = host
        },

        getDeclaredNamespaces(): string[] {
            return [BOLL_STATE_KEY]
        },

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]

            const state = pluginHost?.getSharedState<BOLLRenderState>(BOLL_STATE_KEY)
            if (!state || state.visibleMin > state.visibleMax) {
                clearCache()
                return
            }
            if (state.series.length === 0) {
                clearCache()
                return
            }

            const { period, showUpper, showMiddle, showLower, showBand } = state.params
            const bollData = state.series

            if (klineData.length < period) {
                clearCache()
                return
            }

            const drawStart = Math.max(range.start, period - 1)
            const drawEnd = Math.min(range.end, klineData.length)
            const cacheKey = buildBOLLCacheKey(
                range,
                kLineCenters,
                pane,
                showUpper,
                showMiddle,
                showLower,
                showBand,
                period
            )

            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                // 延迟构建 Path2D，只在 WebGL 失败后按需构建
                cachedBandPath = null
                cachedUpperPath = null
                cachedMiddlePath = null
                cachedLowerPath = null
                cachedUpperPoints = []
                cachedMiddlePoints = []
                cachedLowerPoints = []
                cachedBandUpperPoints = []
                cachedBandLowerPoints = []

                for (let i = drawStart; i < drawEnd; i++) {
                    const boll = bollData[i]
                    if (!boll) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue

                    const upperY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(boll.upper), dpr)
                    const middleY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(boll.middle), dpr)
                    const lowerY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(boll.lower), dpr)

                    const upperPoint = { x: centerX, y: upperY }
                    const middlePoint = { x: centerX, y: middleY }
                    const lowerPoint = { x: centerX, y: lowerY }

                    if (showBand) {
                        cachedBandUpperPoints.push(upperPoint)
                        cachedBandLowerPoints.push(lowerPoint)
                    }
                    if (showUpper) cachedUpperPoints.push(upperPoint)
                    if (showMiddle) cachedMiddlePoints.push(middlePoint)
                    if (showLower) cachedLowerPoints.push(lowerPoint)
                }
            }

            if (drawBOLLWithWebGL(context, {
                showUpper,
                showMiddle,
                showLower,
                showBand,
                upperPoints: cachedUpperPoints,
                middlePoints: cachedMiddlePoints,
                lowerPoints: cachedLowerPoints,
                bandUpperPoints: cachedBandUpperPoints,
                bandLowerPoints: cachedBandLowerPoints,
            })) {
                return
            }

            // WebGL 失败，按需构建 Path2D
            if (showBand && !cachedBandPath && cachedBandUpperPoints.length >= 2) {
                cachedBandPath = new Path2D()
                let started = false
                for (const p of cachedBandUpperPoints) {
                    if (!started) {
                        cachedBandPath.moveTo(p.x, p.y)
                        started = true
                    } else {
                        cachedBandPath.lineTo(p.x, p.y)
                    }
                }
                for (let i = cachedBandLowerPoints.length - 1; i >= 0; i--) {
                    const p = cachedBandLowerPoints[i]!
                    cachedBandPath.lineTo(p.x, p.y)
                }
                cachedBandPath.closePath()
            }
            if (showUpper && !cachedUpperPath && cachedUpperPoints.length >= 2) {
                cachedUpperPath = new Path2D()
                let started = false
                for (const p of cachedUpperPoints) {
                    if (!started) {
                        cachedUpperPath.moveTo(p.x, p.y)
                        started = true
                    } else {
                        cachedUpperPath.lineTo(p.x, p.y)
                    }
                }
            }
            if (showMiddle && !cachedMiddlePath && cachedMiddlePoints.length >= 2) {
                cachedMiddlePath = new Path2D()
                let started = false
                for (const p of cachedMiddlePoints) {
                    if (!started) {
                        cachedMiddlePath.moveTo(p.x, p.y)
                        started = true
                    } else {
                        cachedMiddlePath.lineTo(p.x, p.y)
                    }
                }
            }
            if (showLower && !cachedLowerPath && cachedLowerPoints.length >= 2) {
                cachedLowerPath = new Path2D()
                let started = false
                for (const p of cachedLowerPoints) {
                    if (!started) {
                        cachedLowerPath.moveTo(p.x, p.y)
                        started = true
                    } else {
                        cachedLowerPath.lineTo(p.x, p.y)
                    }
                }
            }

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            if (cachedBandPath) {
                ctx.fillStyle = BOLL_COLORS.BAND_FILL
                ctx.fill(cachedBandPath)
            }

            if (cachedUpperPath) {
                ctx.strokeStyle = BOLL_COLORS.UPPER
                ctx.stroke(cachedUpperPath)
            }

            if (cachedMiddlePath) {
                ctx.strokeStyle = BOLL_COLORS.MIDDLE
                ctx.stroke(cachedMiddlePath)
            }

            if (cachedLowerPath) {
                ctx.strokeStyle = BOLL_COLORS.LOWER
                ctx.stroke(cachedLowerPath)
            }

            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<BOLLRenderState>(BOLL_STATE_KEY)
            return state ? { ...state.params } : {}
        },

        setConfig(_newConfig: Record<string, unknown>) {
            // 外部控制器应调用 chart.getIndicatorScheduler().updateBOLLConfig()
        },
    }
}
