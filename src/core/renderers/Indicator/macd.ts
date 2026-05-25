import type { RendererPluginWithHost, RenderContext, PluginHost } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { MACD_COLORS } from '@/core/theme/colors'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import type { MACDRenderState } from '@/core/indicators/macdState'
import { createMACDStateKey } from '@/core/indicators/macdState'
import type { MACDPoint } from '@/core/indicators/calculators'
import { calcMACDData } from '@/core/indicators/calculators'

type Rect = { x: number; y: number; width: number; height: number }
type LinePoint = { x: number; y: number }

export interface MACDConfig {
  /** 快线周期（默认 12） */
  fastPeriod?: number
  /** 慢线周期（默认 26） */
  slowPeriod?: number
  /** DEA 周期（默认 9） */
  signalPeriod?: number
  /** 是否显示 DIF 线 */
  showDIF?: boolean
  /** 是否显示 DEA 线 */
  showDEA?: boolean
  /** 是否显示 MACD 柱 */
  showBAR?: boolean
}

export interface MACDRendererOptions {
  /** 目标 pane ID（默认 'sub'） */
  paneId?: string
  /** 初始配置 */
  config?: MACDConfig
}

/**
 * 创建 MACD 渲染器插件
 * 从 StateStore 读取 MACD 状态，不再内联计算
 */
export function createMACDRendererPlugin(options: MACDRendererOptions = {}): RendererPluginWithHost {
  const { paneId = 'sub', config: initialConfig = {} } = options

  const stateKey = createMACDStateKey(paneId)
  let pluginHost: PluginHost | null = null

  const config: Required<MACDConfig> = {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    showDIF: true,
    showDEA: true,
    showBAR: true,
    ...initialConfig,
  }

  // 线条点缓存（用于 WebGL/Canvas2D 渲染）
  let cachedLineKey = ''
  let cachedDifPoints: LinePoint[] = []
  let cachedDeaPoints: LinePoint[] = []

  function clearLineCache() {
    cachedLineKey = ''
    cachedDifPoints = []
    cachedDeaPoints = []
  }

  // 构建线条缓存 key
  function buildLineCacheKey(
    range: { start: number; end: number },
    kLineCenters: number[],
    pane: RenderContext['pane'],
    displayMin: number,
    displayMax: number
  ): string {
    const dr = pane.yAxis.getDisplayRange()
    return [
      range.start,
      range.end,
      kLineCenters.length,
      kLineCenters[0]?.toFixed(2) ?? 'n',
      kLineCenters[kLineCenters.length - 1]?.toFixed(2) ?? 'n',
      displayMax.toFixed(6),
      displayMin.toFixed(6),
      pane.yAxis.getPriceOffset().toFixed(6),
      pane.yAxis.getScaleType(),
      pane.height.toFixed(2),
      config.showDIF,
      config.showDEA,
    ].join('|')
  }

  return {
    name: `macd_${paneId}`,
    version: '1.0.0',
    description: 'MACD 指标渲染器',
    debugName: 'MACD',
    paneId: paneId,
    priority: RENDERER_PRIORITY.INDICATOR,

    onInstall(host: PluginHost) {
      pluginHost = host
    },

    getDeclaredNamespaces() {
      return [stateKey]
    },

    draw(context: RenderContext) {
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters, lineWebGLSurface } = context
      const klineData = data as KLineData[]

      // 从 StateStore 读取 MACD 状态
      const state = pluginHost?.getSharedState<MACDRenderState>(stateKey)
      if (!state || state.visibleMin > state.visibleMax) return
      if (klineData.length < config.slowPeriod) return

      const macdData = state.series
      if (!macdData || macdData.length === 0) return

      // 使用 state 中的极值，或回退到计算
      let valueMin = state.visibleMin
      let valueMax = state.visibleMax

      // 添加 padding
      const padding = Math.max(0.05, (valueMax - valueMin) * 0.1)
      valueMin = valueMin - padding
      valueMax = valueMax + padding
      const valueRange = valueMax - valueMin || 1

      const displayRange = pane.yAxis.getDisplayRange({ minPrice: valueMin, maxPrice: valueMax })
      const displayMin = displayRange.minPrice
      const displayMax = displayRange.maxPrice
      const displayValueRange = displayMax - displayMin || 1

      // 零轴位置
      const zeroY = pane.height - (0 - displayMin) / displayValueRange * pane.height

      const drawStart = Math.max(range.start, config.slowPeriod - 1)
      const drawEnd = Math.min(range.end, klineData.length)

      // 绘制 MACD 柱状图（WebGL 优先）
      if (config.showBAR) {
        const alignedZeroY = Math.round(zeroY * dpr) / dpr

        const barUpRects: Array<{ x: number; y: number; width: number; height: number }> = []
        const barUpLightRects: Array<{ x: number; y: number; width: number; height: number }> = []
        const barDownRects: Array<{ x: number; y: number; width: number; height: number }> = []
        const barDownLightRects: Array<{ x: number; y: number; width: number; height: number }> = []

        for (let i = drawStart; i < drawEnd; i++) {
          const point = macdData[i]
          if (!point) continue

          const barRect = context.kBarRects[i - range.start]
          if (!barRect) continue

          const barY = pane.height - (point.macd - displayMin) / displayValueRange * pane.height
          const isPositive = point.macd >= 0

          const prevPoint = i > 0 ? macdData[i - 1] : null
          const isRising = prevPoint ? point.macd >= prevPoint.macd : true

          const alignedBarY = Math.round(barY * dpr) / dpr
          const minBarHPx = 1 / dpr

          if (isPositive) {
            const rawH = alignedZeroY - alignedBarY
            const finalH = rawH <= 0 ? minBarHPx : Math.max(rawH, minBarHPx)
            const finalBarY = rawH <= 0 ? alignedZeroY - minBarHPx : alignedZeroY - finalH
            const rect = { x: barRect.x, y: finalBarY, width: barRect.width, height: finalH }
            if (isRising) { barUpRects.push(rect) } else { barUpLightRects.push(rect) }
          } else {
            const rawH = alignedBarY - alignedZeroY
            const finalH = rawH <= 0 ? minBarHPx : Math.max(rawH, minBarHPx)
            const rect = { x: barRect.x, y: alignedZeroY, width: barRect.width, height: finalH }
            if (isRising) { barDownLightRects.push(rect) } else { barDownRects.push(rect) }
          }
        }

        const usedWebGL = drawMacdBarsWithWebGL(context, barUpRects, barUpLightRects, barDownRects, barDownLightRects)
        if (!usedWebGL) {
          drawMacdBarsWithCanvas2D(ctx, scrollLeft, barUpRects, barUpLightRects, barDownRects, barDownLightRects)
        } else {
          compositeMacdWebGL(ctx, context)
        }
      }

      // 更新线条点缓存
      const lineCacheKey = buildLineCacheKey(range, kLineCenters, pane, displayMin, displayMax)
      if (cachedLineKey !== lineCacheKey) {
        cachedLineKey = lineCacheKey
        cachedDifPoints = []
        cachedDeaPoints = []

        if (config.showDIF) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = macdData[i]
            if (!point) continue
            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue
            const logicY = pane.height - (point.dif - displayMin) / displayValueRange * pane.height
            cachedDifPoints.push({ x: centerX, y: logicY })
          }
        }

        if (config.showDEA) {
          for (let i = drawStart; i < drawEnd; i++) {
            const point = macdData[i]
            if (!point) continue
            const centerX = kLineCenters[i - range.start]
            if (centerX === undefined) continue
            const logicY = pane.height - (point.dea - displayMin) / displayValueRange * pane.height
            cachedDeaPoints.push({ x: centerX, y: logicY })
          }
        }
      }

      // 绘制 DIF/DEA 线（WebGL 优先，Canvas2D 回退）
      const enableWebGL = context.settings?.enableWebGLRendering !== false
      let usedWebGLForLines = false
      if (enableWebGL && lineWebGLSurface?.isAvailable()) {
        let allOk = true
        if (config.showDIF && cachedDifPoints.length >= 2) {
          allOk = lineWebGLSurface.drawLineStrip(
            { points: cachedDifPoints, width: 1 },
            MACD_COLORS.DIF,
            scrollLeft
          )
        }
        if (allOk && config.showDEA && cachedDeaPoints.length >= 2) {
          allOk = lineWebGLSurface.drawLineStrip(
            { points: cachedDeaPoints, width: 1 },
            MACD_COLORS.DEA,
            scrollLeft
          )
        }
        if (allOk) {
          usedWebGLForLines = true
          const canvas = lineWebGLSurface.getCanvas()
          if (canvas.width > 0 && canvas.height > 0) {
            const prevImageSmoothingEnabled = ctx.imageSmoothingEnabled
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width / dpr, canvas.height / dpr)
            ctx.imageSmoothingEnabled = prevImageSmoothingEnabled
          }
        }
      }

      if (!usedWebGLForLines) {
        drawMacdLinesWithCanvas2D(ctx, scrollLeft, cachedDifPoints, cachedDeaPoints, config)
      }
    },

    onDataUpdate() {
      clearLineCache()
    },

    getConfig() {
      return { ...config }
    },

    setConfig(newConfig: Record<string, unknown>) {
      let needClearLineCache = false
      if ('fastPeriod' in newConfig && newConfig.fastPeriod !== config.fastPeriod) {
        clearLineCache()
      }
      if ('slowPeriod' in newConfig && newConfig.slowPeriod !== config.slowPeriod) {
        clearLineCache()
      }
      if ('signalPeriod' in newConfig && newConfig.signalPeriod !== config.signalPeriod) {
        clearLineCache()
      }
      if ('showDIF' in newConfig && newConfig.showDIF !== config.showDIF) {
        needClearLineCache = true
      }
      if ('showDEA' in newConfig && newConfig.showDEA !== config.showDEA) {
        needClearLineCache = true
      }
      Object.assign(config, newConfig)
      if (needClearLineCache) {
        clearLineCache()
      }
    },
  }
}

function drawMacdBarsWithWebGL(
  context: RenderContext,
  barUpRects: Rect[],
  barUpLightRects: Rect[],
  barDownRects: Rect[],
  barDownLightRects: Rect[]
): boolean {
  if (context.settings?.enableWebGLRendering === false) return false
  const surface = context.candleWebGLSurface
  if (!surface || !surface.isAvailable()) return false

  surface.clear()

  const ok1 = barUpRects.length === 0 || surface.drawRects(barUpRects, MACD_COLORS.BAR_UP, context.scrollLeft)
  const ok2 = barUpLightRects.length === 0 || surface.drawRects(barUpLightRects, MACD_COLORS.BAR_UP_LIGHT, context.scrollLeft)
  const ok3 = barDownRects.length === 0 || surface.drawRects(barDownRects, MACD_COLORS.BAR_DOWN, context.scrollLeft)
  const ok4 = barDownLightRects.length === 0 || surface.drawRects(barDownLightRects, MACD_COLORS.BAR_DOWN_LIGHT, context.scrollLeft)

  return ok1 && ok2 && ok3 && ok4
}

function drawMacdBarsWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  barUpRects: Rect[],
  barUpLightRects: Rect[],
  barDownRects: Rect[],
  barDownLightRects: Rect[]
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)

  ctx.fillStyle = MACD_COLORS.BAR_UP
  for (const r of barUpRects) ctx.fillRect(r.x, r.y, r.width, r.height)

  ctx.fillStyle = MACD_COLORS.BAR_UP_LIGHT
  for (const r of barUpLightRects) ctx.fillRect(r.x, r.y, r.width, r.height)

  ctx.fillStyle = MACD_COLORS.BAR_DOWN
  for (const r of barDownRects) ctx.fillRect(r.x, r.y, r.width, r.height)

  ctx.fillStyle = MACD_COLORS.BAR_DOWN_LIGHT
  for (const r of barDownLightRects) ctx.fillRect(r.x, r.y, r.width, r.height)

  ctx.restore()
}

function drawMacdLinesWithCanvas2D(
  ctx: CanvasRenderingContext2D,
  scrollLeft: number,
  difPoints: LinePoint[],
  deaPoints: LinePoint[],
  config: { showDIF: boolean; showDEA: boolean }
): void {
  ctx.save()
  ctx.translate(-scrollLeft, 0)
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (config.showDIF && difPoints.length >= 2) {
    ctx.strokeStyle = MACD_COLORS.DIF
    ctx.beginPath()
    ctx.moveTo(difPoints[0]!.x, difPoints[0]!.y)
    for (let i = 1; i < difPoints.length; i++) {
      const point = difPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  if (config.showDEA && deaPoints.length >= 2) {
    ctx.strokeStyle = MACD_COLORS.DEA
    ctx.beginPath()
    ctx.moveTo(deaPoints[0]!.x, deaPoints[0]!.y)
    for (let i = 1; i < deaPoints.length; i++) {
      const point = deaPoints[i]!
      ctx.lineTo(point.x, point.y)
    }
    ctx.stroke()
  }

  ctx.restore()
}

function compositeMacdWebGL(ctx: CanvasRenderingContext2D, context: RenderContext): void {
  const surface = context.candleWebGLSurface
  if (!surface) return

  const canvas = surface.getCanvas()
  if (canvas.width <= 0 || canvas.height <= 0) return

  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width / context.dpr, canvas.height / context.dpr)
}

/**
 * 计算指定索引处的 MACD 值（供图例使用）
 * 使用 calculators.ts 中的计算函数
 */
export function calcMACDAtIndex(
  data: KLineData[],
  index: number,
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { dif: number; dea: number; macd: number } | null {
  if (index < slowPeriod || index >= data.length) return null

  const macdData = calcMACDData(data, fastPeriod, slowPeriod, signalPeriod)
  return macdData[index] ?? null
}

/**
 * 获取 MACD 标题信息（供 paneTitle 使用）
 */
export function getMACDTitleInfo(
  data: KLineData[],
  index: number,
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { name: string; params: number[]; values: Array<{ label: string; value: number; color: string }> } | null {
  const macdValue = calcMACDAtIndex(data, index, fastPeriod, slowPeriod, signalPeriod)
  if (!macdValue) return null

  return {
    name: 'MACD',
    params: [fastPeriod, slowPeriod, signalPeriod],
    values: [
      { label: 'DIF', value: macdValue.dif, color: MACD_COLORS.DIF },
      { label: 'DEA', value: macdValue.dea, color: MACD_COLORS.DEA },
      { label: 'MACD', value: macdValue.macd, color: macdValue.macd >= 0 ? MACD_COLORS.BAR_UP : MACD_COLORS.BAR_DOWN },
    ],
  }
}
