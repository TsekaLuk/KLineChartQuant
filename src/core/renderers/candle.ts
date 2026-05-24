import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { getKLineTrend, type kLineTrend } from '@/types/kLine'
import { createAlignedKLineFromPx, createVerticalLineRect } from '@/core/draw/pixelAlign'
import { PRICE_COLORS } from '@/core/theme/colors'
import { getPhysicalKLineConfig } from '@/core/chart'
import { VolumePriceRelation } from '@/types/volumePrice'
import { analyzeVolumePriceRelationBatch, DEFAULT_VOLUME_PRICE_CONFIG } from '@/utils/volumePrice'
import type { MarkerManager } from '@/core/marker/registry'

type Rect = {
    x: number
    y: number
    width: number
    height: number
}

type CandleRenderData = {
    i: number
    aligned: ReturnType<typeof createAlignedKLineFromPx>
    trend: kLineTrend
    openY: number
    closeY: number
    highY: number
    lowY: number
    alignedHighY: number
    alignedLowY: number
    e: KLineData
}

type PreparedCandles = {
    upKLines: CandleRenderData[]
    downKLines: CandleRenderData[]
    upBodyRects: Rect[]
    downBodyRects: Rect[]
    upWickRects: Rect[]
    downWickRects: Rect[]
    wickWidth: number
    relations: VolumePriceRelation[] | null
    showVolumePriceMarkers: boolean
}

/**
 * 创建 K 线蜡烛图渲染器插件
 */
export function createCandleRenderer(): RendererPlugin {
    return {
        name: 'candle',
        version: '1.0.0',
        description: 'K线蜡烛图渲染器',
        debugName: 'K线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.MAIN,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, kGap, dpr, kLinePositions, markerManager, settings } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return

            const prepared = prepareCandles({
                pane,
                data: klineData,
                range,
                kWidth,
                kGap,
                dpr,
                kLinePositions,
                settings,
            })

            const usedWebGL = drawCandlesWithWebGL(context, prepared)
            if (!usedWebGL) {
                drawCandlesWithCanvas2D(ctx, scrollLeft, prepared)
            } else {
                compositeWebGLToMainCanvas(ctx, context)
            }

            drawVolumePriceMarkers(context, prepared, markerManager as MarkerManager | undefined)
        },
    }
}

function prepareCandles(args: {
    pane: RenderContext['pane']
    data: KLineData[]
    range: { start: number; end: number }
    kWidth: number
    kGap: number
    dpr: number
    kLinePositions: number[]
    settings?: RenderContext['settings']
}): PreparedCandles {
    const { pane, data, range, kWidth, kGap, dpr, kLinePositions, settings } = args
    const { kWidthPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
    const showVolumePriceMarkers = settings?.showVolumePriceMarkers !== false
    const relations = showVolumePriceMarkers
        ? analyzeVolumePriceRelationBatch(data, range.start, range.end, DEFAULT_VOLUME_PRICE_CONFIG)
        : null

    const upKLines: CandleRenderData[] = []
    const downKLines: CandleRenderData[] = []
    const upBodyRects: Rect[] = []
    const downBodyRects: Rect[] = []
    const upWickRects: Rect[] = []
    const downWickRects: Rect[] = []

    // 预取 displayRange，避免循环内每根 K 线 4 次 getDisplayRange()
    const { maxPrice, minPrice } = pane.yAxis.getDisplayRange()
    const paddingTop = pane.yAxis.getPaddingTop()
    const paddingBottom = pane.yAxis.getPaddingBottom()
    const viewHeight = Math.max(1, pane.height - paddingTop - paddingBottom)
    const isLinear = pane.yAxis.getScaleType() !== 'log'
    let fastPriceToY: (price: number) => number
    if (isLinear) {
        const priceRange = maxPrice - minPrice || 1
        const scaleK = viewHeight / priceRange
        const scaleB = paddingTop + viewHeight
        fastPriceToY = (price: number) => scaleB - (price - minPrice) * scaleK
    } else {
        // 对数模式回退到标准方法
        fastPriceToY = (price: number) => pane.yAxis.priceToY(price)
    }

    for (let i = range.start; i < range.end && i < data.length; i++) {
        const e = data[i]
        if (!e) continue

        const openY = fastPriceToY(e.open)
        const closeY = fastPriceToY(e.close)
        const highY = fastPriceToY(e.high)
        const lowY = fastPriceToY(e.low)

        const leftLogical = kLinePositions[i - range.start]
        if (leftLogical === undefined) continue

        const alignY = (logical: number) => Math.round(logical * dpr) / dpr
        const alignedOpenY = alignY(openY)
        const alignedCloseY = alignY(closeY)
        const alignedHighY = alignY(highY)
        const alignedLowY = alignY(lowY)
        const alignedRawRectY = Math.min(alignedOpenY, alignedCloseY)
        const alignedRawRectH = Math.max(Math.abs(alignedOpenY - alignedCloseY), 1)

        const roundedLeftPx = Math.round(leftLogical * dpr)
        const aligned = createAlignedKLineFromPx(
            roundedLeftPx,
            alignedRawRectY,
            kWidthPx,
            alignedRawRectH,
            dpr
        )

        const trend: kLineTrend = getKLineTrend(e)
        const renderData: CandleRenderData = {
            i,
            aligned,
            trend,
            openY,
            closeY,
            highY,
            lowY,
            alignedHighY,
            alignedLowY,
            e,
        }

        const bodyRect = aligned.bodyRect
        const targetKLines = trend === 'up' ? upKLines : downKLines
        const targetBodies = trend === 'up' ? upBodyRects : downBodyRects
        const targetWicks = trend === 'up' ? upWickRects : downWickRects

        targetKLines.push(renderData)
        targetBodies.push(bodyRect)

        const bodyTop = aligned.bodyRect.y
        const bodyBottom = aligned.bodyRect.y + aligned.bodyRect.height
        const bodyHigh = Math.max(e.open, e.close)
        const bodyLow = Math.min(e.open, e.close)

        if (e.high > bodyHigh) {
            const wick = createVerticalLineRect(aligned.wickRect.x, alignedHighY, bodyTop, dpr)
            if (wick) targetWicks.push(wick)
        }
        if (e.low < bodyLow) {
            const wick = createVerticalLineRect(aligned.wickRect.x, bodyBottom, alignedLowY, dpr)
            if (wick) targetWicks.push(wick)
        }
    }

    const wickWidth = upKLines[0]?.aligned.wickRect.width ?? downKLines[0]?.aligned.wickRect.width ?? 1

    return {
        upKLines,
        downKLines,
        upBodyRects,
        downBodyRects,
        upWickRects,
        downWickRects,
        wickWidth,
        relations,
        showVolumePriceMarkers,
    }
}

function drawCandlesWithCanvas2D(ctx: CanvasRenderingContext2D, scrollLeft: number, prepared: PreparedCandles): void {
    ctx.save()
    ctx.translate(-scrollLeft, 0)

    ctx.fillStyle = PRICE_COLORS.UP
    for (const rect of prepared.upBodyRects) {
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    }

    ctx.fillStyle = PRICE_COLORS.DOWN
    for (const rect of prepared.downBodyRects) {
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    }

    ctx.fillStyle = PRICE_COLORS.UP
    for (const rect of prepared.upWickRects) {
        ctx.fillRect(rect.x, rect.y, prepared.wickWidth, rect.height)
    }

    ctx.fillStyle = PRICE_COLORS.DOWN
    for (const rect of prepared.downWickRects) {
        ctx.fillRect(rect.x, rect.y, prepared.wickWidth, rect.height)
    }

    ctx.restore()
}

function drawCandlesWithWebGL(context: RenderContext, prepared: PreparedCandles): boolean {
    if (context.settings?.enableWebGLRendering === false) return false
    const surface = context.candleWebGLSurface
    if (!surface || !surface.isAvailable()) return false

    surface.clear()

    const bodyUpOk = prepared.upBodyRects.length === 0 || surface.drawRects(prepared.upBodyRects, PRICE_COLORS.UP, context.scrollLeft)
    const bodyDownOk = prepared.downBodyRects.length === 0 || surface.drawRects(prepared.downBodyRects, PRICE_COLORS.DOWN, context.scrollLeft)
    const wickUpOk = prepared.upWickRects.length === 0 || surface.drawRects(prepared.upWickRects, PRICE_COLORS.UP, context.scrollLeft)
    const wickDownOk = prepared.downWickRects.length === 0 || surface.drawRects(prepared.downWickRects, PRICE_COLORS.DOWN, context.scrollLeft)

    return bodyUpOk && bodyDownOk && wickUpOk && wickDownOk
}

function compositeWebGLToMainCanvas(ctx: CanvasRenderingContext2D, context: RenderContext): void {
    const surface = context.candleWebGLSurface
    if (!surface) return

    const canvas = surface.getCanvas()
    if (canvas.width <= 0 || canvas.height <= 0) return

    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width / context.dpr, canvas.height / context.dpr)
}

function drawVolumePriceMarkers(
    context: RenderContext,
    prepared: PreparedCandles,
    markerManager: MarkerManager | undefined
): void {
    const { ctx, range, kWidth, dpr } = context
    if (!prepared.showVolumePriceMarkers || !markerManager || (context.zoomLevel ?? 1) < 2) {
        return
    }

    ctx.save()
    ctx.translate(-context.scrollLeft, 0)

    for (const k of prepared.upKLines) {
        const relation = prepared.relations?.[k.i - range.start]
        if (relation !== undefined && relation !== VolumePriceRelation.OTHERS) {
            const isRising = relation === VolumePriceRelation.RISE_WITH_VOLUME || relation === VolumePriceRelation.RISE_WITHOUT_VOLUME
            const markerY = isRising ? k.alignedHighY - 15 : k.alignedLowY + 15
            const posIndex = k.i - range.start
            const markerX = context.kLineCenters[posIndex]!
            drawVolumePriceMarker(ctx, markerX, markerY, relation, k.i, kWidth, 4, markerManager, dpr)
        }
    }

    for (const k of prepared.downKLines) {
        const relation = prepared.relations?.[k.i - range.start]
        if (relation !== undefined && relation !== VolumePriceRelation.OTHERS) {
            const isRising = relation === VolumePriceRelation.RISE_WITH_VOLUME || relation === VolumePriceRelation.RISE_WITHOUT_VOLUME
            const markerY = isRising ? k.alignedHighY - 15 : k.alignedLowY + 15
            const posIndex = k.i - range.start
            const markerX = context.kLineCenters[posIndex]!
            drawVolumePriceMarker(ctx, markerX, markerY, relation, k.i, kWidth, 4, markerManager, dpr)
        }
    }

    ctx.restore()
}

/**
* 绘制量价关系标记
* 在K线图上标注量价关系标记符号
*
* @param ctx - Canvas绘图上下文
* @param x - 标记的x坐标（三角形水平中心）
* @param y - 标记的y坐标（三角形底边/顶点与K线的接触点）
* @param relation - 量价关系类型
* @param kWidth - K线宽度，作为三角形边长
* @param gap - 三角形与K线的间距，默认为4
* @param dpr - 设备像素比
*/
export function drawVolumePriceMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    relation: VolumePriceRelation,
    kIndex: number,
    kWidth: number,
    gap: number = 4,
    markerManager: MarkerManager,
    dpr: number
): void {
    const align = (v: number) => Math.round(v * dpr) / dpr
    x = align(x)
    y = align(y)

    const sideLength = Math.min(kWidth, 20)
    const height = sideLength * Math.sqrt(3) / 2

    let color: string
    let isUp: boolean

    switch (relation) {
        case VolumePriceRelation.RISE_WITH_VOLUME:
            color = '#FF4444'
            isUp = true
            break
        case VolumePriceRelation.RISE_WITHOUT_VOLUME:
            color = '#00C853'
            isUp = true
            break
        case VolumePriceRelation.FALL_WITH_VOLUME:
            color = '#FF4444'
            isUp = false
            break
        case VolumePriceRelation.FALL_WITHOUT_VOLUME:
            color = '#00C853'
            isUp = false
            break
        default:
            return
    }

    ctx.save()
    ctx.beginPath()

    if (isUp) {
        const baseY = align(y - gap)
        const tipY = align(baseY - height)

        ctx.moveTo(x, tipY)
        ctx.lineTo(align(x - sideLength / 2), baseY)
        ctx.lineTo(align(x + sideLength / 2), baseY)
    } else {
        const baseY = align(y + gap)
        const tipY = align(baseY + height)

        ctx.moveTo(x, tipY)
        ctx.lineTo(align(x - sideLength / 2), baseY)
        ctx.lineTo(align(x + sideLength / 2), baseY)
    }

    ctx.closePath()

    ctx.fillStyle = color
    ctx.fill()

    ctx.restore()

    let boundingX: number
    let boundingY: number

    if (isUp) {
        const baseY = align(y - gap)
        const tipY = align(baseY - height)
        boundingX = align(x - sideLength / 2)
        boundingY = tipY
    } else {
        const baseY = align(y + gap)
        const tipY = align(baseY + height)
        boundingX = align(x - sideLength / 2)
        boundingY = baseY
    }

    let markerTypeKey: string
    switch (relation) {
        case VolumePriceRelation.RISE_WITH_VOLUME:
            markerTypeKey = 'RISE_WITH_VOLUME'
            break
        case VolumePriceRelation.RISE_WITHOUT_VOLUME:
            markerTypeKey = 'RISE_WITHOUT_VOLUME'
            break
        case VolumePriceRelation.FALL_WITH_VOLUME:
            markerTypeKey = 'FALL_WITH_VOLUME'
            break
        case VolumePriceRelation.FALL_WITHOUT_VOLUME:
            markerTypeKey = 'FALL_WITHOUT_VOLUME'
            break
        default:
            return
    }

    const markerId = `mk_price-volume_${kIndex}`
    markerManager.register({
        id: markerId,
        type: 'triangle',
        markerType: markerTypeKey,
        x: boundingX,
        y: boundingY,
        width: sideLength,
        height: height,
        dataIndex: kIndex,
        metadata: { relation }
    })
}
