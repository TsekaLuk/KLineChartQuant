import type { RendererPlugin, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '@/plugin'
import type { KLineData } from '@/types/price'
import { roundToPhysicalPixel, alignToPhysicalPixelCenter, createHorizontalLineRect } from '@/core/draw/pixelAlign'
import { TEXT_COLORS, PRICE_COLORS } from '@/core/theme/colors'
import { FONT_FAMILY } from '@/core/theme/fonts'

/**
 * 创建可视区最高/最低价标注渲染器插件
 */
export function createExtremaMarkersRendererPlugin(): RendererPlugin {
    return {
        name: 'extremaMarkers',
        version: '1.0.0',
        description: '可视区最高/最低价标注渲染器',
        debugName: '极值标记',
        paneId: GLOBAL_PANE_ID,
        priority: RENDERER_PRIORITY.OVERLAY,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, paneWidth, kLineCenters } = context
            const klineData = data as KLineData[]
            if (!klineData.length) return
            if (pane.role !== 'price') return

            const start = Math.max(0, range.start)
            const end = Math.min(klineData.length, range.end)
            if (end - start <= 0) return

            let max = -Infinity
            let min = Infinity
            let maxIndex = start
            let minIndex = start

            for (let i = start; i < end; i++) {
                const e = klineData[i]
                if (!e) continue
                if (e.high >= max) {
                    max = e.high
                    maxIndex = i
                }
                if (e.low <= min) {
                    min = e.low
                    minIndex = i
                }
            }

            if (!Number.isFinite(max) || !Number.isFinite(min)) return

            // 使用统一的 kLineCenters 作为 K 线中心 X 坐标
            const getCenterX = (i: number) => {
                const localIdx = i - range.start
                if (localIdx < 0 || localIdx >= kLineCenters.length) return 0
                return kLineCenters[localIdx]!
            }

            // 注册Y轴标签（供轴渲染器绘制）
            if (!context.yAxisLabels) context.yAxisLabels = []

            // 最高价标签
            context.yAxisLabels.push({
                dataIndex: maxIndex,
                price: max,
                y: pane.yAxis.priceToY(max),
                style: {
                    bgColor: 'rgba(255, 247, 248, 0.98)',
                    borderColor: PRICE_COLORS.LAST_PRICE,
                    textColor: PRICE_COLORS.LAST_PRICE,
                }
            })

            // 最低价标签
            context.yAxisLabels.push({
                dataIndex: minIndex,
                price: min,
                y: pane.yAxis.priceToY(min),
                style: {
                    bgColor: 'rgba(255, 247, 248, 0.98)',
                    borderColor: PRICE_COLORS.LAST_PRICE,
                    textColor: PRICE_COLORS.LAST_PRICE,
                }
            })

            ctx.save()
            ctx.translate(-scrollLeft, 0)
            drawPriceMarker(ctx, getCenterX(maxIndex), pane.yAxis.priceToY(max), max, dpr, paneWidth, scrollLeft)
            drawPriceMarker(ctx, getCenterX(minIndex), pane.yAxis.priceToY(min), min, dpr, paneWidth, scrollLeft)
            ctx.restore()
        },
    }
}

/**
 * 绘制价格标记
 */
function drawPriceMarker(ctx: CanvasRenderingContext2D, x: number, y: number, price: number, dpr: number, paneWidth: number, scrollLeft: number) {
    const text = price.toFixed(2)
    const padding = 4
    const lineLength = 30
    const dotRadius = 2

    ctx.font = `12px ${FONT_FAMILY}`
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width

    const visibleX = x - scrollLeft
    const rightEdge = visibleX + lineLength + padding + textWidth
    const drawLeft = rightEdge > paneWidth
    let lineStartX = x
    let lineEndX = drawLeft ? x - lineLength : x + lineLength
    if (lineStartX > lineEndX) {
        ;[lineStartX, lineEndX] = [lineEndX, lineStartX]
    }
    const lineRect = createHorizontalLineRect(lineStartX, lineEndX, y, dpr)
    if (lineRect) {
        ctx.fillStyle = TEXT_COLORS.WEAK
        ctx.fillRect(lineRect.x, lineRect.y, lineRect.width, lineRect.height)
    }

    const endX = roundToPhysicalPixel(lineEndX, dpr)
    const alignedY = roundToPhysicalPixel(y, dpr)
    ctx.fillStyle = TEXT_COLORS.WEAK
    ctx.beginPath()
    ctx.arc(endX, alignedY, dotRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = PRICE_COLORS.NEUTRAL

    if (drawLeft) {
        ctx.textAlign = 'right'
        ctx.fillText(text, roundToPhysicalPixel(x - lineLength - padding, dpr), alignToPhysicalPixelCenter(y, dpr))
    } else {
        ctx.textAlign = 'left'
        ctx.fillText(text, roundToPhysicalPixel(x + lineLength + padding, dpr), alignToPhysicalPixelCenter(y, dpr))
    }
}
