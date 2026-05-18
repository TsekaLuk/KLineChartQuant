import type { RendererPluginWithHost, PluginHost, RenderContext, BaseIndicatorState } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'
import { TEXT_COLORS } from '@/core/theme/colors'
import { FONT_FAMILY } from '@/core/theme/fonts'
import { calculateValueTickPositions, type ScaleType } from '@/core/utils/tickPosition'
import { drawCrosshairPriceLabel } from '@/utils/kLineDraw/axis'
import { roundToPhysicalPixel, alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'

interface IndicatorScaleRenderState extends BaseIndicatorState {
    valueMin: number
    valueMax: number
}

export interface IndicatorScaleRendererOptions {
    axisWidth: number
    paneId: string
    indicatorKey: string
    label: string
    decimals?: number
    yPaddingPx?: number
    scaleType?: ScaleType
    getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
    formatTickLabel?: (value: number) => string
    formatCrosshairLabel?: (value: number) => string
}

export interface DrawScaleTicksOptions {
    ctx: CanvasRenderingContext2D
    dpr: number
    axisWidth: number
    height: number
    paddingTop: number
    paddingBottom: number
    valueMin: number
    valueMax: number
    isMain: boolean
    decimals?: number
    hideEdgeTicks?: boolean
    scaleType?: ScaleType
    formatLabel?: (value: number) => string
}

export function drawScaleTicks(options: DrawScaleTicksOptions): void {
    const {
        ctx,
        dpr,
        axisWidth,
        height,
        paddingTop,
        paddingBottom,
        valueMin,
        valueMax,
        isMain,
        decimals = 2,
        hideEdgeTicks = true,
        scaleType = 'linear',
        formatLabel,
    } = options

    ctx.save()
    ctx.clearRect(0, 0, axisWidth, height)

    ctx.font = `12px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const centerX = axisWidth / 2

    const positions = calculateValueTickPositions({
        height,
        paddingTop,
        paddingBottom,
        isMain,
        hideEdgeTicks,
        valueMin,
        valueMax,
        scaleType,
    })

    for (const { y, value } of positions) {
        ctx.fillStyle = TEXT_COLORS.SECONDARY
        ctx.fillText(
            formatLabel ? formatLabel(value) : value.toFixed(decimals),
            roundToPhysicalPixel(centerX, dpr),
            alignToPhysicalPixelCenter(y, dpr)
        )
    }

    ctx.restore()
}

export function createIndicatorScaleRendererPlugin(options: IndicatorScaleRendererOptions): RendererPluginWithHost {
    const {
        axisWidth,
        paneId,
        indicatorKey,
        label,
        decimals = 2,
        yPaddingPx = 0,
        scaleType = 'linear',
        getCrosshair,
        formatTickLabel,
        formatCrosshairLabel,
    } = options
    const stateKey = createIndicatorStateKey(indicatorKey, paneId)
    let pluginHost: PluginHost | null = null

    return {
        name: `${indicatorKey}Scale_${paneId}`,
        version: '1.0.0',
        description: `${label} 刻度渲染器`,
        debugName: `${label}刻度`,
        paneId,
        priority: RENDERER_PRIORITY.INDICATOR_SCALE,

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        draw(context: RenderContext) {
            const { yAxisCtx, pane, dpr } = context
            if (!yAxisCtx || !pluginHost) return

            const state = pluginHost.getSharedState<IndicatorScaleRenderState>(stateKey)
            if (!state) return

            // 优先使用 pane 的 scaleType，构造函数参数作为 fallback
            const effectiveScaleType: ScaleType = pane.yAxis.getScaleType() ?? scaleType

            const displayRange = pane.yAxis.getDisplayRange({
                minPrice: state.valueMin,
                maxPrice: state.valueMax,
            })

            drawScaleTicks({
                ctx: yAxisCtx,
                dpr,
                axisWidth,
                height: pane.height,
                paddingTop: pane.yAxis.getPaddingTop(),
                paddingBottom: pane.yAxis.getPaddingBottom(),
                valueMin: displayRange.minPrice,
                valueMax: displayRange.maxPrice,
                isMain: false,
                decimals,
                hideEdgeTicks: false,
                scaleType: effectiveScaleType,
                formatLabel: formatTickLabel,
            })

            const crosshair = getCrosshair?.()
            if (!crosshair || crosshair.activePaneId !== pane.id) return

            const localY = crosshair.y - pane.top
            const paddingTop = pane.yAxis.getPaddingTop()
            const paddingBottom = pane.yAxis.getPaddingBottom()
            const yStart = paddingTop
            const yEnd = Math.max(paddingTop, pane.height - paddingBottom)
            const viewH = Math.max(1, yEnd - yStart)
            const clampedY = Math.min(Math.max(localY, yStart), yEnd)
            const t = (clampedY - yStart) / viewH
            const displayPrice = displayRange.maxPrice - t * (displayRange.maxPrice - displayRange.minPrice)

            drawCrosshairPriceLabel(yAxisCtx, {
                x: 0,
                y: 0,
                width: axisWidth,
                height: pane.height,
                crosshairY: localY,
                priceRange: displayRange,
                yPaddingPx,
                dpr,
                fontSize: 12,
                priceOffset: 0,
                price: displayPrice,
                formatPrice: formatCrosshairLabel,
            })
        },
    }
}
