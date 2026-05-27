import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { MA_STATE_KEY, type MARenderState } from '@/core/indicators/maState'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { MA_COLORS } from '@/core/theme/colors'

// Re-export MAFlags from calculators for backward compatibility
export type { MAFlags } from '@/core/indicators/calculators'

type LinePoint = { x: number; y: number }

const MA_COLOR_MAP: Record<number, string> = {
    5: MA_COLORS.MA5,
    10: MA_COLORS.MA10,
    20: MA_COLORS.MA20,
    30: MA_COLORS.MA30,
    60: MA_COLORS.MA60,
}

function buildMACacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    enabledPeriods: number[]
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
        enabledPeriods.join(','),
        pane.height.toFixed(2),
    ].join('|')
}

export function createMARendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null
    let cachedKey = ''
    let cachedLines = new Map<number, LinePoint[]>()

    function clearCache() {
        cachedKey = ''
        cachedLines = new Map()
    }

    return {
        name: 'ma',
        version: '2.1.0',
        description: 'MA均线渲染器',
        debugName: 'MA均线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        onInstall(host: PluginHost): void {
            pluginHost = host
        },

        getDeclaredNamespaces(): string[] {
            return [MA_STATE_KEY]
        },

        draw(context: RenderContext) {
            const { ctx, pane, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context
            const state = pluginHost?.getSharedState<MARenderState>(MA_STATE_KEY)

            if (!state || state.visibleMin > state.visibleMax) {
                clearCache()
                return
            }

            if (state.enabledPeriods.length === 0) {
                clearCache()
                return
            }

            const cacheKey = buildMACacheKey(range, kLineCenters, pane, state.enabledPeriods)
            if (cachedKey !== cacheKey) {
                cachedKey = cacheKey
                cachedLines = new Map()

                for (const [periodStr, values] of Object.entries(state.series)) {
                    const period = Number(periodStr)
                    const points: LinePoint[] = []

                    for (let i = range.start; i < range.end && i < values.length; i++) {
                        const maValue = values[i]
                        if (maValue === undefined) continue

                        const centerX = kLineCenters[i - range.start]
                        if (centerX === undefined) continue

                        points.push({ x: centerX, y: pane.yAxis.priceToY(maValue) })
                    }

                    if (points.length >= 2) {
                        cachedLines.set(period, points)
                    }
                }
            }

            // 检查 WebGL 渲染开关（默认开启）及 GPU 加速是否可用
            const enableWebGL = context.settings?.enableWebGLRendering !== false
            let usedWebGL = false
            if (enableWebGL && lineWebGLSurface?.isAvailable()) {
                // 组装所有周期的折线数据，批量提交 GPU 一次性渲染，避免逐条 beginPath 的 CPU 开销
                const lines: Array<{ points: LinePoint[]; width: number; color: string }> = []
                for (const period of state.enabledPeriods) {
                    const points = cachedLines.get(period)
                    if (!points) continue
                    lines.push({ points, width: 1, color: MA_COLOR_MAP[period] ?? MA_COLORS.MA5 })
                }
                const allOk = lines.length > 0 && lineWebGLSurface.drawLineStrips(lines, scrollLeft)

                if (allOk) {
                    usedWebGL = true
                    // 将 WebGL 离屏帧缓冲区内容通过 drawImage 合成到主 Canvas2D
                    lineWebGLSurface.compositeTo(ctx, { imageSmoothingEnabled: false })
                }
            }

            // WebGL 渲染失败或未开启时的 Canvas2D 降级路径
            if (usedWebGL) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            for (const period of state.enabledPeriods) {
                const points = cachedLines.get(period)
                if (!points || points.length < 2) continue
                ctx.strokeStyle = MA_COLOR_MAP[period] ?? MA_COLORS.MA5
                ctx.beginPath()
                ctx.moveTo(points[0]!.x, points[0]!.y)
                for (let i = 1; i < points.length; i++) {
                    const point = points[i]!
                    ctx.lineTo(point.x, point.y)
                }
                ctx.stroke()
            }

            ctx.restore()
        },

        getConfig() {
            const state = pluginHost?.getSharedState<MARenderState>(MA_STATE_KEY)
            const config: Record<string, boolean> = {}
            state?.enabledPeriods.forEach(period => {
                config[`ma${period}`] = true
            })
            return config
        },

        setConfig(_newConfig: Record<string, unknown>) {
        },
    }
}
