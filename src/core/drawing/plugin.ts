import type { RendererPlugin, RenderContext, DrawingStyle, DrawingPrimitive } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import {
  DrawingStore,
  DrawingDefinitionRegistry,
  createDefaultPrimitiveRendererSet,
  registerDefaultDrawingDefinitions,
} from './index'
import type { PrimitiveRendererSet } from './index'
import type { KLineData } from '@/types/price'
import { getPhysicalKLineConfig } from '@/core/utils/klineConfig'

export function createDrawingRendererPlugin(options: {
  store: DrawingStore
  paneId?: string
  definitions?: DrawingDefinitionRegistry
  renderers?: PrimitiveRendererSet
}): RendererPlugin {
  const store = options.store
  const definitions = options.definitions ?? new DrawingDefinitionRegistry()
  const renderers = options.renderers ?? createDefaultPrimitiveRendererSet()
  registerDefaultDrawingDefinitions(definitions)

  return {
    name: 'drawingRenderer',
    version: '0.1.0',
    description: '绘图渲染器',
    debugName: '绘图层',
    paneId: options.paneId ?? 'main',
    priority: -25, // 比 SYSTEM_YAXIS (-20) 更早执行，确保锚点标签先被填充
    draw(context: RenderContext) {
      const { ctx, pane, data, range, dpr, paneWidth, kLinePositions, kLineCenters, kBarRects, kWidth, kGap } = context
      const viewport = context.viewport ?? {
        scrollLeft: context.scrollLeft,
        plotWidth: paneWidth,
        plotHeight: pane.height,
      }
      const { startXPx, unitPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
      const seriesData = data as KLineData[]
      const visibleData = seriesData.slice(range.start, range.end)
      const drawings = store.getVisibleByPane(pane.id)
      if (drawings.length === 0) return

      const viewportClip = {
        left: 0,
        top: 0,
        right: viewport.plotWidth,
        bottom: pane.height,
      }

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, viewport.plotWidth, pane.height)
      ctx.clip()

      for (const drawing of drawings) {
        const geometry = definitions.compute(drawing, {
          pane,
          visibleData,
          seriesData,
          range,
          kLinePositions,
          kLineCenters,
          kBarRects,
          kWidth,
          kGap,
          dpr,
          paneWidth,
          viewport,
          toScreen(anchor) {
            if (!Number.isFinite(anchor.index) || anchor.index < 0) {
              return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
            }
            const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
            return { x, y: pane.yAxis.priceToY(anchor.price) }
          },
        })
        if (!geometry) continue

        const isSelected = store.getSelectedId() === drawing.id
        const primitives = isSelected
          ? geometry.primitives.map((p) => applySelectedStyle(p, drawing.style))
          : geometry.primitives

        // 只在选中且可见时添加锚点轴标签
        if (isSelected && drawing.visible && pane.role === 'price') {
          // 合并用户锚点和计算锚点
          const allAnchors = [...drawing.anchors, ...(geometry.computedAnchors ?? [])]
          if (allAnchors.length === 0) return

          // 计算锚点价格范围，用于Y轴价格范围带
          if (allAnchors.length >= 2) {
            let minP = Infinity, maxP = -Infinity
            for (const a of allAnchors) {
              if (!Number.isFinite(a.price)) continue
              if (a.price < minP) minP = a.price
              if (a.price > maxP) maxP = a.price
            }
            if (Number.isFinite(minP) && Number.isFinite(maxP) && minP !== maxP) {
              if (!context.yAxisRanges) context.yAxisRanges = []
              context.yAxisRanges.push({
                topY: pane.yAxis.priceToY(maxP),   // 高价→小Y→上方
                bottomY: pane.yAxis.priceToY(minP), // 低价→大Y→下方
                color: drawing.style?.stroke ?? '#2962ff',
                opacity: 0.15,
              })
            }
          }

          // 计算锚点X坐标范围，用于X轴时间范围带
          if (allAnchors.length >= 2) {
            let minIdx = Infinity, maxIdx = -Infinity
            for (const a of allAnchors) {
              if (!Number.isFinite(a.index) || a.index < 0) continue
              if (a.index < minIdx) minIdx = a.index
              if (a.index > maxIdx) maxIdx = a.index
            }
            if (Number.isFinite(minIdx) && Number.isFinite(maxIdx) && minIdx !== maxIdx) {
              if (!context.xAxisRanges) context.xAxisRanges = []
              const leftX = (startXPx + minIdx * unitPx + (unitPx - 1) / 2) / dpr  // 世界坐标
              const rightX = (startXPx + maxIdx * unitPx + (unitPx - 1) / 2) / dpr
              context.xAxisRanges.push({
                leftX,
                rightX,
                color: drawing.style?.stroke ?? '#2962ff',
                opacity: 0.15,
              })
            }
          }

          // 辅助函数：根据index获取时间戳，超出数据范围时extrapolate
          const getTimestampForIndex = (idx: number): number | null => {
            // 在数据范围内，直接返回
            if (idx >= 0 && idx < seriesData.length) {
              return seriesData[idx]?.timestamp ?? null
            }
            // 超出范围，根据最后两根K线的时间间隔推算
            if (seriesData.length >= 2 && idx >= seriesData.length) {
              const lastIdx = seriesData.length - 1
              const secondLastIdx = seriesData.length - 2
              const lastTs = seriesData[lastIdx]!.timestamp
              const secondLastTs = seriesData[secondLastIdx]!.timestamp
              const timeStep = lastTs - secondLastTs
              return lastTs + (idx - lastIdx) * timeStep
            }
            return null
          }

          for (const anchor of allAnchors) {
            if (!Number.isFinite(anchor.index) || !Number.isFinite(anchor.price)) continue

            const screenPoint = (() => {
              if (anchor.index < 0) {
                return { x: -kWidth, y: pane.yAxis.priceToY(anchor.price) }
              }
              const x = (startXPx + anchor.index * unitPx + (unitPx - 1) / 2) / dpr - viewport.scrollLeft
              return { x, y: pane.yAxis.priceToY(anchor.price) }
            })()

            // Y轴标签 - 仅检查Y方向可见性
            if (screenPoint.y >= 0 && screenPoint.y <= pane.height) {
              if (!context.yAxisLabels) context.yAxisLabels = []
              context.yAxisLabels.push({
                dataIndex: Math.round(anchor.index),
                price: anchor.price,
                y: screenPoint.y,
                style: {
                  bgColor: drawing.style?.stroke ?? '#2962ff',
                  borderColor: drawing.style?.stroke ?? '#2962ff',
                  textColor: '#ffffff',
                }
              })
            }

            // X轴标签 - 仅检查X方向可见性
            if (screenPoint.x >= -kWidth && screenPoint.x <= viewport.plotWidth + kWidth) {
              const timestamp = anchor.time
                ? (typeof anchor.time === 'string' ? new Date(anchor.time).getTime() : anchor.time)
                : getTimestampForIndex(Math.round(anchor.index))
              if (!timestamp) continue  // 无法获取有效时间戳则跳过X轴标签

              if (!context.xAxisLabels) context.xAxisLabels = []
              context.xAxisLabels.push({
                dataIndex: Math.round(anchor.index),
                timestamp,
                x: screenPoint.x + viewport.scrollLeft, // 转回世界坐标
                style: {
                  bgColor: drawing.style?.stroke ?? '#2962ff',
                  textColor: '#ffffff',
                }
              })
            }
          }
        }

        for (const primitive of primitives) {
          if (primitive.kind === 'point') {
            renderers.point(ctx, primitive, dpr)
            continue
          }
          if (primitive.kind === 'line') {
            renderers.line(ctx, primitive, viewportClip, dpr)
            continue
          }
          if (primitive.kind === 'area') {
            renderers.area(ctx, primitive, dpr)
            continue
          }
          renderers.text(ctx, primitive, dpr)
        }
      }

      ctx.restore()
    },
  }
}

function applySelectedStyle(primitive: DrawingPrimitive, baseStyle: DrawingStyle): DrawingPrimitive {
  const selectedStroke = baseStyle.stroke ?? '#2962ff'
  const selectedWidth = (baseStyle.strokeWidth ?? 1) + 1
  const selectedPointRadius = (baseStyle.pointRadius ?? 4) + 2

  if (primitive.kind === 'point') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke, pointRadius: selectedPointRadius } }
  }
  if (primitive.kind === 'line') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke, strokeWidth: selectedWidth } }
  }
  if (primitive.kind === 'area') {
    return { ...primitive, style: { ...primitive.style, stroke: selectedStroke } }
  }
  // text
  return { ...primitive, style: { ...primitive.style, textColor: selectedStroke, fontSize: (primitive.style?.fontSize ?? 12) + 1 } }
}
