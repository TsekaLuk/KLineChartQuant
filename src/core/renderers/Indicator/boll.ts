import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { BOLL_COLORS } from '@/core/theme/colors'
import { BOLL_STATE_KEY, type BOLLRenderState } from '@/core/indicators/bollState'

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
    ].join('|')
}

export function createBOLLRendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null
    let cachedKey = ''
    let cachedBandPath: Path2D | null = null
    let cachedUpperPath: Path2D | null = null
    let cachedMiddlePath: Path2D | null = null
    let cachedLowerPath: Path2D | null = null

    function clearCache() {
        cachedKey = ''
        cachedBandPath = null
        cachedUpperPath = null
        cachedMiddlePath = null
        cachedLowerPath = null
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
                cachedBandPath = showBand ? new Path2D() : null
                cachedUpperPath = showUpper ? new Path2D() : null
                cachedMiddlePath = showMiddle ? new Path2D() : null
                cachedLowerPath = showLower ? new Path2D() : null

                let hasBandStarted = false
                let hasUpperStarted = false
                let hasMiddleStarted = false
                let hasLowerStarted = false

                for (let i = drawStart; i < drawEnd; i++) {
                    const boll = bollData[i]
                    if (!boll) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue

                    const upperY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(boll.upper), dpr)
                    const middleY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(boll.middle), dpr)
                    const lowerY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(boll.lower), dpr)

                    if (cachedBandPath) {
                        if (!hasBandStarted) {
                            cachedBandPath.moveTo(centerX, upperY)
                            hasBandStarted = true
                        } else {
                            cachedBandPath.lineTo(centerX, upperY)
                        }
                    }

                    if (cachedUpperPath) {
                        if (!hasUpperStarted) {
                            cachedUpperPath.moveTo(centerX, upperY)
                            hasUpperStarted = true
                        } else {
                            cachedUpperPath.lineTo(centerX, upperY)
                        }
                    }

                    if (cachedMiddlePath) {
                        if (!hasMiddleStarted) {
                            cachedMiddlePath.moveTo(centerX, middleY)
                            hasMiddleStarted = true
                        } else {
                            cachedMiddlePath.lineTo(centerX, middleY)
                        }
                    }

                    if (cachedLowerPath) {
                        if (!hasLowerStarted) {
                            cachedLowerPath.moveTo(centerX, lowerY)
                            hasLowerStarted = true
                        } else {
                            cachedLowerPath.lineTo(centerX, lowerY)
                        }
                    }
                }

                if (cachedBandPath && hasBandStarted) {
                    for (let i = drawEnd - 1; i >= drawStart; i--) {
                        const boll = bollData[i]
                        if (!boll) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        const lowerY = alignToPhysicalPixelCenter(pane.yAxis.priceToY(boll.lower), dpr)
                        cachedBandPath.lineTo(centerX, lowerY)
                    }
                    cachedBandPath.closePath()
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
