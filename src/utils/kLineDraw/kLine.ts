import { getKLineTrend, type kLineTrend } from '@/types/kLine'
import type { KLineData } from '@/types/price'
import { priceToY } from '../priceToY'
import {
  roundToPhysicalPixel,
  createHorizontalLineRect,
  createAlignedKLine,
} from '@/core/draw/pixelAlign'
import { getColors } from '@/core/theme/colors'
import { getFont, setCanvasFont } from '@/core/theme/fonts'

export interface drawOption {
  kWidth: number
  kGap: number
  yPaddingPx?: number
}

export interface PriceRange {
  maxPrice: number
  minPrice: number
}

/**
 * 绘制价格标记
 */
function drawPriceMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  price: number,
  dpr: number,
  theme: 'light' | 'dark' = 'light'
) {
  const colors = getColors(theme)
  const text = price.toFixed(2)
  const padding = 4
  const lineLength = 30
  const dotRadius = 2

  const lineRect = createHorizontalLineRect(x, x + lineLength, y, dpr)
  if (lineRect) {
    ctx.fillStyle = colors.TEXT.WEAK
    ctx.fillRect(lineRect.x, lineRect.y, lineRect.width, lineRect.height)
  }

  const endX = roundToPhysicalPixel(x + lineLength, dpr)
  const alignedY = roundToPhysicalPixel(y, dpr)
  ctx.fillStyle = colors.TEXT.WEAK
  ctx.beginPath()
  ctx.arc(endX, alignedY, dotRadius, 0, Math.PI * 2)
  ctx.fill()

  setCanvasFont(ctx, getFont(12))
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = colors.TEXT.PRIMARY
  ctx.fillText(
    text,
    roundToPhysicalPixel(x + lineLength + padding, dpr),
    roundToPhysicalPixel(y, dpr)
  )
}

/**
 * @deprecated
 * K线图绘制 - 影线固定为 1 物理像素宽
 */
export function kLineDraw(
  ctx: CanvasRenderingContext2D,
  data: KLineData[],
  option: drawOption,
  logicHeight: number,
  dpr: number = 1,
  startIndex: number = 0,
  endIndex: number = data.length,
  priceRange?: PriceRange,
  theme: 'light' | 'dark' = 'light'
) {
  if (data.length === 0) return

  const colors = getColors(theme)
  const height = logicHeight

  const wantPad = option.yPaddingPx ?? 0
  const pad = Math.max(0, Math.min(wantPad, Math.floor(height / 2) - 1))
  const paddingTop = pad
  const paddingBottom = pad

  const unit = option.kWidth + option.kGap

  let visibleMaxPrice: number
  let visibleMinPrice: number
  let maxPriceIndex = startIndex
  let minPriceIndex = startIndex

  if (priceRange) {
    visibleMaxPrice = priceRange.maxPrice
    visibleMinPrice = priceRange.minPrice
    for (let i = startIndex; i < endIndex && i < data.length; i++) {
      const e = data[i]
      if (!e) continue
      if (e.high >= visibleMaxPrice) {
        visibleMaxPrice = e.high
        maxPriceIndex = i
      }
      if (e.low <= visibleMinPrice) {
        visibleMinPrice = e.low
        minPriceIndex = i
      }
    }
  } else {
    visibleMaxPrice = -Infinity
    visibleMinPrice = Infinity
    for (let i = startIndex; i < endIndex && i < data.length; i++) {
      const e = data[i]
      if (!e) continue
      if (e.high > visibleMaxPrice) {
        visibleMaxPrice = e.high
        maxPriceIndex = i
      }
      if (e.low < visibleMinPrice) {
        visibleMinPrice = e.low
        minPriceIndex = i
      }
    }
  }

  if (!Number.isFinite(visibleMaxPrice) || !Number.isFinite(visibleMinPrice)) return

  for (let i = startIndex; i < endIndex && i < data.length; i++) {
    const e = data[i]
    if (!e) continue

    const highY = priceToY(e.high, visibleMaxPrice, visibleMinPrice, height, paddingTop, paddingBottom)
    const lowY = priceToY(e.low, visibleMaxPrice, visibleMinPrice, height, paddingTop, paddingBottom)
    const openY = priceToY(e.open, visibleMaxPrice, visibleMinPrice, height, paddingTop, paddingBottom)
    const closeY = priceToY(e.close, visibleMaxPrice, visibleMinPrice, height, paddingTop, paddingBottom)

    const rectX = option.kGap + i * unit
    const rawRectY = Math.min(openY, closeY)
    const rawRectHeight = Math.max(Math.abs(openY - closeY), 1)

    const aligned = createAlignedKLine(rectX, rawRectY, option.kWidth, rawRectHeight, dpr)

    const trend: kLineTrend = getKLineTrend(e)
    const color = trend === 'up' ? colors.PRICE.UP : colors.PRICE.DOWN

    ctx.fillStyle = color
    ctx.fillRect(aligned.bodyRect.x, aligned.bodyRect.y, aligned.bodyRect.width, aligned.bodyRect.height)

    const bodyTop = aligned.bodyRect.y
    const bodyBottom = aligned.bodyRect.y + aligned.bodyRect.height
    const bodyHigh = Math.max(e.open, e.close)
    const bodyLow = Math.min(e.open, e.close)

    ctx.fillStyle = color

    if (e.high > bodyHigh) {
      const wickTopY = Math.min(highY, bodyTop)
      const wickBottomY = Math.max(highY, bodyTop)
      const physTop = Math.round(wickTopY * dpr)
      const physBottom = Math.round(wickBottomY * dpr)

      ctx.fillRect(
        aligned.wickRect.x,
        physTop / dpr,
        aligned.wickRect.width,
        Math.max(1, physBottom - physTop) / dpr
      )
    }

    if (e.low < bodyLow) {
      const wickTopY = Math.min(lowY, bodyBottom)
      const wickBottomY = Math.max(lowY, bodyBottom)
      const physTop = Math.round(wickTopY * dpr)
      const physBottom = Math.round(wickBottomY * dpr)

      ctx.fillRect(
        aligned.wickRect.x,
        physTop / dpr,
        aligned.wickRect.width,
        Math.max(1, physBottom - physTop) / dpr
      )
    }

    if (i === maxPriceIndex) {
      const markerX = aligned.physWickX / dpr
      drawPriceMarker(ctx, markerX, highY, visibleMaxPrice, dpr, theme)
    }

    if (i === minPriceIndex) {
      const markerX = aligned.physWickX / dpr
      drawPriceMarker(ctx, markerX, lowY, visibleMinPrice, dpr, theme)
    }
  }
}
