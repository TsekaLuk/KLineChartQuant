import type { RendererPluginWithHost, RenderContext, PluginHost, BaseIndicatorState } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'
import type { KLineData } from '@/types/price'
import { VOLUME_COLORS } from '@/core/theme/colors'

type Rect = { x: number; y: number; width: number; height: number }

export interface VolumeRendererOptions {
    /** 目标 pane ID（默认 'sub'） */
    paneId?: string
}

export interface VolumeRenderState extends BaseIndicatorState {
    valueMin: number
    valueMax: number
}

/**
 * 创建副图成交量渲染器插件
 */
export function createVolumeRendererPlugin(options: VolumeRendererOptions = {}): RendererPluginWithHost {
    const { paneId = 'sub' } = options
    const stateKey = createIndicatorStateKey('volume', paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `volume_${paneId}`,
        version: '1.0.0',
        description: '成交量渲染器',
        debugName: '成交量',
        paneId,
        priority: RENDERER_PRIORITY.MAIN,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        getDeclaredNamespaces() {
            return [stateKey]
        },

        draw(context: RenderContext) {
            const { ctx, pane, data, range, dpr } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            const { start, end } = range

            let maxVolume = 0
            let minVolume = Infinity
            for (let i = start; i < end && i < klineData.length; i++) {
                const item = klineData[i]
                if (!item) continue
                const volume = item.volume
                if (volume !== undefined && volume !== null) {
                    maxVolume = Math.max(maxVolume, volume)
                    minVolume = Math.min(minVolume, volume)
                }
            }

            if (maxVolume === 0 || !Number.isFinite(minVolume)) {
                return
            }

            const padding = Math.max(0.05, (maxVolume - minVolume) * 0.1)
            const valueMin = Math.max(0, minVolume - padding)
            const valueMax = maxVolume + padding
            const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
            const displayMin = displayRange.minPrice
            const displayMax = displayRange.maxPrice
            const displayValueRange = displayMax - displayMin || 1
            const baseY = pane.height - (0 - displayMin) / displayValueRange * pane.height
            const alignedBaseY = Math.round(baseY * dpr) / dpr

            pluginHost?.setSharedState<VolumeRenderState>(stateKey, {
                valueMin,
                valueMax,
                timestamp: Date.now(),
            }, `volume_${paneId}`)

            const upRects: Rect[] = []
            const downRects: Rect[] = []
            const neutralRects: Rect[] = []

            for (let i = start; i < end; i++) {
                const item = klineData[i]
                if (!item) continue
                const volume = item.volume
                if (!volume) continue
                const barRect = context.kBarRects[i - start]
                if (!barRect) continue

                const y = pane.height - (volume - displayMin) / displayValueRange * pane.height
                const alignedY = Math.round(y * dpr) / dpr
                const minBarHPx = 1 / dpr
                const rawH = alignedBaseY - alignedY
                const finalH = rawH <= 0 ? minBarHPx : Math.max(rawH, minBarHPx)
                const finalY = rawH <= 0 ? alignedBaseY - minBarHPx : alignedBaseY - finalH

                const rect: Rect = { x: barRect.x, y: finalY, width: barRect.width, height: finalH }
                const color = judgeColor(item)

                if (color === VOLUME_COLORS.UP) {
                    upRects.push(rect)
                } else if (color === VOLUME_COLORS.DOWN) {
                    downRects.push(rect)
                } else {
                    neutralRects.push(rect)
                }
            }

            const usedWebGL = drawVolumeWithWebGL(context, upRects, downRects, neutralRects)
            if (!usedWebGL) {
                console.log('[vol] Canvas2D')
                drawVolumeWithCanvas2D(ctx, context.scrollLeft, upRects, downRects, neutralRects)
            } else {
                console.log('[vol] WebGL')
                compositeVolumeWebGL(ctx, context)
            }
        },
    }
}

function drawVolumeWithWebGL(
    context: RenderContext,
    upRects: Rect[],
    downRects: Rect[],
    neutralRects: Rect[]
): boolean {
    const surface = context.candleWebGLSurface
    if (!surface || !surface.isAvailable()) return false

    surface.clear()

    const ok1 = upRects.length === 0 || surface.drawRects(upRects, VOLUME_COLORS.UP, context.scrollLeft)
    const ok2 = downRects.length === 0 || surface.drawRects(downRects, VOLUME_COLORS.DOWN, context.scrollLeft)
    const ok3 = neutralRects.length === 0 || surface.drawRects(neutralRects, VOLUME_COLORS.NEUTRAL, context.scrollLeft)

    return ok1 && ok2 && ok3
}

function drawVolumeWithCanvas2D(
    ctx: CanvasRenderingContext2D,
    scrollLeft: number,
    upRects: Rect[],
    downRects: Rect[],
    neutralRects: Rect[]
): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)

    ctx.fillStyle = VOLUME_COLORS.UP
    for (const r of upRects) {
        ctx.fillRect(r.x, r.y, r.width, r.height)
    }

    ctx.fillStyle = VOLUME_COLORS.DOWN
    for (const r of downRects) {
        ctx.fillRect(r.x, r.y, r.width, r.height)
    }

    ctx.fillStyle = VOLUME_COLORS.NEUTRAL
    for (const r of neutralRects) {
        ctx.fillRect(r.x, r.y, r.width, r.height)
    }

    ctx.restore()
}

function compositeVolumeWebGL(ctx: CanvasRenderingContext2D, context: RenderContext): void {
    const surface = context.candleWebGLSurface
    if (!surface) return

    const canvas = surface.getCanvas()
    if (canvas.width <= 0 || canvas.height <= 0) return

    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width / context.dpr, canvas.height / context.dpr)
}

/**
 * 判断成交量柱子颜色（使用 MACD 配色风格）
 */
function judgeColor(dayData: KLineData) {
    if (dayData.close > dayData.open) {
        return VOLUME_COLORS.UP
    } else if (dayData.close < dayData.open) {
        return VOLUME_COLORS.DOWN
    } else {
        return VOLUME_COLORS.NEUTRAL
    }
}
