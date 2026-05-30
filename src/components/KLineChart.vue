<template>
  <div class="chart-wrapper">
    <div
      class="chart-stage"
      :class="{
        'is-dragging': isDragging,
        'is-resizing-pane': isResizingPane,
        'is-hovering-pane-separator': isHoveringPaneSeparator,
        'is-hovering-right-axis': isHoveringRightAxis,
        'is-hovering-kline': hoveredIdx !== null,
      }"
    >
      <LeftToolbar
        ref="toolbarRef"
        :is-fullscreen="isFullscreen"
        @select-tool="handleSelectTool"
        @toggle-fullscreen="$emit('toggleFullscreen')"
        @zoom-in="applyZoomToLevel(zoomLevel + 1)"
        @zoom-out="applyZoomToLevel(zoomLevel - 1)"
        @settings-change="handleSettingsChange"
      />
      <div class="chart-main" ref="chartMainRef">
        <div class="pane-separator-layer" aria-hidden="true">
          <div
            v-for="line in paneSeparatorLines"
            :key="line.id"
            class="pane-separator-line"
            :class="{ 'is-active': hoveredPaneBoundaryId === line.id }"
            :style="{ top: `${line.top}px` }"
          ></div>
        </div>
        <div ref="tooltipLayerRef" class="tooltip-layer"></div>
        <div
          class="chart-container"
          :style="{ cursor: containerCursor }"
          ref="containerRef"
          @scroll.passive="onScroll"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="onPointerLeave"
        >
          <!-- scroll-content 负责撑开横向滚动宽度，并承载 sticky 的画布层 -->
          <div class="scroll-content" :style="{ width: totalWidth + 'px' }">
            <!-- 画布层：sticky 固定在可视区域左上角，滚动只影响绘制时的 scrollLeft -->
            <div class="canvas-layer" ref="canvasLayerRef">
              <!-- plotCanvas 由 Chart 自动创建 -->

              <!-- 底部时间轴（随 X 滚动，但画布不移动） -->
              <canvas class="x-axis-canvas" ref="xAxisCanvasRef"></canvas>

              <DrawingStyleToolbar
                v-if="selectedDrawing"
                :drawing="selectedDrawing"
                @update-style="onUpdateDrawingStyle"
                @delete="onDeleteDrawing"
              />
            </div>
          </div>
        </div>
        <Teleport v-if="tooltipLayerRef" :to="tooltipLayerRef">
          <div
            v-if="hovered"
            class="tooltip-anchor kline-tooltip-anchor"
            :class="{ 'use-anchor': useAnchorPositioning }"
            :style="klineTooltipAnchorStyle"
          ></div>
          <div
            v-if="hoveredMarker || hoveredCustomMarker"
            class="tooltip-anchor marker-tooltip-anchor"
            :class="{ 'use-anchor': useAnchorPositioning }"
            :style="markerTooltipAnchorStyle"
          ></div>
          <KLineTooltip
            v-if="hovered"
            :k="hovered"
            :index="hoveredIndex"
            :data="chartData"
            :pos="teleportedTooltipPos"
            :set-el="setTooltipEl"
            :use-anchor="useAnchorPositioning"
            :anchor-placement="tooltipAnchorPlacement"
          />
          <MarkerTooltip
            v-if="hoveredMarker || hoveredCustomMarker"
            :marker="hoveredMarker || hoveredCustomMarker"
            :pos="teleportedMarkerTooltipPos"
            :use-anchor="useAnchorPositioning"
            :anchor-placement="markerTooltipAnchorPlacement"
            :set-el="setMarkerTooltipEl"
          />
        </Teleport>
        <div
          class="right-axis-host"
          ref="rightAxisLayerRef"
          :style="{ width: axisHostWidth + 'px' }"
          @pointerdown="onRightAxisPointerDown"
          @pointermove="onRightAxisPointerMove"
          @pointerup="onRightAxisPointerUp"
          @pointerleave="onRightAxisPointerLeave"
        ></div>
      </div>
    </div>
    <IndicatorSelector
      :active-indicators="activeIndicators"
      :indicator-params="indicatorParams"
      @toggle="handleIndicatorToggle"
      @update-params="handleUpdateParams"
      @reorder-sub-indicators="handleReorderSubIndicators"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, shallowRef } from 'vue'
import { SemanticChartController, type SemanticChartConfig } from '@/semantic'
import { createCustomMarkersRenderer } from '@/core/renderers/customMarkers'
import KLineTooltip from './KLineTooltip.vue'
import MarkerTooltip from './MarkerTooltip.vue'
import IndicatorSelector from './IndicatorSelector.vue'
import DrawingStyleToolbar from './DrawingStyleToolbar.vue'
import { Chart, type PaneSpec } from '@/core/chart'
import type { KLineData } from '@/types/price'
import { createChartStore, TRAILING_DRAWING_SLOTS, type ChartStore } from '@/core/chart-store'
import {
  zoomLevelToKWidth,
  kGapFromKWidth,
  computeZoom,
  computeZoomToLevel,
} from '@/core/utils/zoom'
import { getPhysicalKLineConfig } from '@/core/utils/klineConfig'
import { createCandleRenderer } from '@/core/renderers/candle'
import { createGridLinesRendererPlugin } from '@/core/renderers/gridLines'
import {
  createLastPriceLineRendererPlugin,
  createLastPriceLabelRegistrarPlugin,
} from '@/core/renderers/lastPrice'
import {
  createMARendererPlugin,
  createBOLLRendererPlugin,
  createEXPMARendererPlugin,
  createENERendererPlugin,
  createMainIndicatorLegendRendererPlugin,
  type SubIndicatorType,
} from '@/core/renderers/Indicator'
import {
  SUB_PANE_INDICATOR_CONFIGS,
  SUB_PANE_INDICATORS,
} from '@/core/renderers/Indicator/subPaneConfig'
import { createYAxisRendererPlugin } from '@/core/renderers/yAxis'
import { createTimeAxisRendererPlugin } from '@/core/renderers/timeAxis'
import { createCrosshairRendererPlugin } from '@/core/renderers/crosshair'
import { createPaneTitleRendererPlugin, type TitleInfo } from '@/core/renderers/paneTitle'
import type { InteractionSnapshot } from '@/core/controller/interaction'
import type { DrawingStyle } from '@/plugin'
import LeftToolbar from './LeftToolbar.vue'
import { DrawingInteractionController, type DrawingToolId } from '@/core/drawing'

const props = withDefaults(
  defineProps<{
    /** 语义化配置（必需，唯一控制源） */
    semanticConfig: SemanticChartConfig

    yPaddingPx?: number
    minKWidth?: number
    maxKWidth?: number
    /** 右侧价格轴宽度 */
    rightAxisWidth?: number
    /** 底部时间轴高度 */
    bottomAxisHeight?: number
    /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
    priceLabelWidth?: number

    /** 缩放级别数量（默认 10） */
    zoomLevels?: number
    /** 初始缩放级别（1 ~ zoomLevels，默认居中） */
    initialZoomLevel?: number
    /** 是否全屏 */
    isFullscreen?: boolean
  }>(),
  {
    yPaddingPx: 0,
    minKWidth: 1,
    maxKWidth: 50,
    rightAxisWidth: 0,
    bottomAxisHeight: 24,
    priceLabelWidth: 60,
    zoomLevels: 20,
    initialZoomLevel: 3,
    isFullscreen: false,
  },
)

const emit = defineEmits<{
  (e: 'zoomLevelChange', level: number, kWidth: number): void
  (e: 'toggleFullscreen'): void
}>()

const xAxisCanvasRef = ref<HTMLCanvasElement | null>(null)
const canvasLayerRef = ref<HTMLDivElement | null>(null)
const rightAxisLayerRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const chartMainRef = ref<HTMLDivElement | null>(null)
const tooltipLayerRef = ref<HTMLDivElement | null>(null)
const toolbarRef = ref<InstanceType<typeof LeftToolbar> | null>(null)

/* ========== 十字线（鼠标悬停位置） ========== */
const chartRef = shallowRef<Chart | null>(null)

/* ========== 语义化控制器 ========== */
const semanticController = shallowRef<SemanticChartController | null>(null)

/* ========== ChartStore（响应式状态中心） ========== */
const store = createChartStore({
  initialZoomLevel: props.initialZoomLevel ?? 1,
  minKWidth: props.minKWidth,
  maxKWidth: props.maxKWidth,
  zoomLevels: props.zoomLevels,
  rightAxisWidth: props.rightAxisWidth,
  priceLabelWidth: props.priceLabelWidth,
})

// 初始化 kWidth / kGap
store.actions.setZoomState(
  store.state.zoomLevel,
  zoomLevelToKWidth(store.state.zoomLevel, {
    minKWidth: props.minKWidth,
    maxKWidth: props.maxKWidth,
    zoomLevelCount: props.zoomLevels,
    dpr: store.state.viewportDpr,
  }),
  kGapFromKWidth(
    zoomLevelToKWidth(store.state.zoomLevel, {
      minKWidth: props.minKWidth,
      maxKWidth: props.maxKWidth,
      zoomLevelCount: props.zoomLevels,
      dpr: store.state.viewportDpr,
    }),
    store.state.viewportDpr,
  ),
)

// 为逐步迁移保留的局部别名
const dataLength = computed(() => store.state.dataLength)
const viewportDpr = computed(() => store.state.viewportDpr)
const zoomLevel = computed(() => store.state.zoomLevel)
const kWidth = computed(() => store.state.kWidth)
const kGap = computed(() => store.state.kGap)
const paneRatios = computed(() => store.state.paneRatios)
const selectedDrawingId = computed(() => store.state.selectedDrawingId)
const dataVersion = computed(() => store.state.dataVersion)

function scheduleRender() {
  chartRef.value?.scheduleDraw()
}

function handleSettingsChange(settings: Record<string, boolean | string>) {
  chartRef.value?.updateSettings(settings)

  // 万条K线性能测试
  if (settings.performanceTest10kKlines) {
    const testData = generate10kKLineData()
    console.time('updateData-10k')
    chartRef.value?.updateData(testData)
    console.timeEnd('updateData-10k')
    store.actions.setDataLength(testData.length)
    store.actions.bumpDataVersion()
  } else {
    // 如果关闭性能测试，恢复原始数据
    // 通过重新应用语义化配置来恢复
    if (semanticController.value && chartRef.value?.getData()?.length === 10000) {
      semanticController.value.applyConfig(props.semanticConfig)
    }
  }
}

// 生成1万条K线测试数据
function generate10kKLineData() {
  const data: KLineData[] = []
  const startTime = new Date('2020-01-01').getTime()
  const dayMs = 24 * 60 * 60 * 1000

  let lastClose = 3000 // 起始价格

  for (let i = 0; i < 10000; i++) {
    const timestamp = startTime + i * dayMs

    // 生成随机波动
    const volatility = 0.02 // 2%日波动率
    const trend = 0.0001 // 轻微上涨趋势
    const change = (Math.random() - 0.5) * 2 * volatility + trend

    const open = lastClose
    const close = open * (1 + change)
    const high = Math.max(open, close) * (1 + Math.random() * 0.01)
    const low = Math.min(open, close) * (1 - Math.random() * 0.01)
    const volume = Math.floor(1000000 + Math.random() * 5000000)

    data.push({
      timestamp,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    })

    lastClose = close
  }

  return data
}

function measureTooltipSize(el: HTMLDivElement, minWidth: number, minHeight: number) {
  const r = el.getBoundingClientRect()
  return {
    width: Math.max(minWidth, Math.round(r.width)),
    height: Math.max(minHeight, Math.round(r.height)),
  }
}

function setTooltipEl(el: HTMLDivElement | null) {
  if (!el) return
  nextTick(() => {
    if (!el.isConnected) return
    const size = measureTooltipSize(el, 180, 80)
    chartRef.value?.interaction.setTooltipSize(size)
  })
}

function setMarkerTooltipEl(el: HTMLDivElement | null) {
  if (!el) return
  nextTick(() => {
    if (!el.isConnected) return
    markerTooltipSize.value = measureTooltipSize(el, 120, 60)
  })
}

// ===== Marker tooltip 状态 =====
const mousePos = ref({ x: 0, y: 0 })
const useAnchorPositioning = ref(false)

// 容器 rect 缓存，避免 pointermove 中反复 getBoundingClientRect 强制同步布局
let _cachedContainerRect: DOMRect | null = null
function invalidateContainerRectCache(): void {
  _cachedContainerRect = null
}
function getContainerRect(container: HTMLDivElement): DOMRect {
  if (!_cachedContainerRect) {
    _cachedContainerRect = container.getBoundingClientRect()
  }
  return _cachedContainerRect
}

// ===== 交互状态（单一来源：InteractionController snapshot） =====
const interactionState = shallowRef<InteractionSnapshot>({
  crosshairPos: null,
  crosshairIndex: null,
  crosshairPrice: null,
  hoveredIndex: null,
  activePaneId: null,
  tooltipPos: { x: 0, y: 0 },
  tooltipAnchorPlacement: 'right-bottom',
  hoveredMarkerData: null,
  hoveredCustomMarker: null,
  isDragging: false,
  isResizingPaneBoundary: false,
  isHoveringPaneBoundary: false,
  hoveredPaneBoundaryId: null,
  isHoveringRightAxis: false,
})

const drawingController = shallowRef<DrawingInteractionController | null>(null)
const selectedDrawing = computed(() => {
  const id = selectedDrawingId.value
  if (!id) return null
  return store.state.drawings.find((d) => d.id === id) ?? null
})
const paneSeparatorLines = ref<Array<{ id: string; top: number }>>([])
const markerTooltipSize = ref({ width: 220, height: 120 })
const tooltipLayerOffset = computed(() => {
  const container = containerRef.value
  const chartMain = chartMainRef.value
  if (!container || !chartMain) return { x: 0, y: 0 }
  return {
    x: container.offsetLeft,
    y: container.offsetTop,
  }
})

const hoveredMarker = computed(() => interactionState.value.hoveredMarkerData)
const hoveredCustomMarker = computed(() => interactionState.value.hoveredCustomMarker)
const isDragging = computed(() => interactionState.value.isDragging)
const isResizingPane = computed(() => interactionState.value.isResizingPaneBoundary)
const isHoveringPaneSeparator = computed(() => interactionState.value.isHoveringPaneBoundary)
const hoveredPaneBoundaryId = computed(() => interactionState.value.hoveredPaneBoundaryId)
const isHoveringRightAxis = computed(() => interactionState.value.isHoveringRightAxis)
const hoveredIdx = computed(() => interactionState.value.hoveredIndex)
const crosshairIdx = computed(() => interactionState.value.crosshairIndex)

// 统一光标样式：用内联 style 替代 CSS 类后代选择器，切断级联失效链
const containerCursor = computed(() => {
  if (isDragging.value) return 'grabbing'
  if (isResizingPane.value || isHoveringPaneSeparator.value) return 'ns-resize'
  if (hoveredIdx.value !== null) return 'pointer'
  return 'crosshair'
})

const hovered = computed(() => {
  const idx = interactionState.value.hoveredIndex
  if (typeof idx !== 'number') return null
  void dataVersion.value // 建立响应式依赖
  const data = chartRef.value?.getData()
  if (data && idx >= 0 && idx < data.length) {
    return data[idx]
  }
  return null
})
const hoveredIndex = computed(() => interactionState.value.hoveredIndex)
const tooltipPos = computed(() => interactionState.value.tooltipPos)
const teleportedTooltipPos = computed(() => ({
  x: tooltipPos.value.x + tooltipLayerOffset.value.x,
  y: tooltipPos.value.y + tooltipLayerOffset.value.y,
}))
const klineTooltipAnchorStyle = computed(() => ({
  left: `${teleportedTooltipPos.value.x}px`,
  top: `${teleportedTooltipPos.value.y}px`,
}))
const teleportedMarkerTooltipPos = computed(() => ({
  x: mousePos.value.x + tooltipLayerOffset.value.x,
  y: mousePos.value.y + tooltipLayerOffset.value.y,
}))
const markerTooltipAnchorStyle = computed(() => ({
  left: `${teleportedMarkerTooltipPos.value.x}px`,
  top: `${teleportedMarkerTooltipPos.value.y}px`,
}))
const tooltipAnchorPlacement = computed(() => interactionState.value.tooltipAnchorPlacement)
const markerTooltipAnchorPlacement = computed<'right-bottom' | 'left-bottom'>(() => {
  const chart = chartRef.value
  const viewport = chart?.getViewport()
  const container = containerRef.value
  const plotWidth = viewport?.plotWidth ?? (container ? container.clientWidth : 0)
  const padding = 12
  const gap = 12
  const rightCandidateX = mousePos.value.x + gap
  const wouldOverflowRight = rightCandidateX + markerTooltipSize.value.width + padding > plotWidth
  return wouldOverflowRight ? 'left-bottom' : 'right-bottom'
})

// 获取当前图表数据
const chartData = computed(() => {
  void dataVersion.value // 建立响应式依赖，确保数据变化时重新求值
  return chartRef.value?.getData() ?? []
})

// 通知数据变化（在数据更新后调用）
function handleSelectTool(toolId: string) {
  drawingController.value?.setTool(toolId as DrawingToolId)
}

function onUpdateDrawingStyle(style: Partial<DrawingStyle>) {
  const d = selectedDrawing.value
  if (!d || !drawingController.value) return
  drawingController.value.updateDrawingStyle(d.id, style)
  store.actions.bumpDrawingVersion()
}

function onDeleteDrawing() {
  const d = selectedDrawing.value
  if (!d || !drawingController.value) return
  drawingController.value.removeDrawing(d.id)
  store.actions.setSelectedDrawingId(null)
  store.actions.bumpDrawingVersion()
  store.actions.setDrawings(drawingController.value.getDrawings())
}

function onPointerDown(e: PointerEvent) {
  chartRef.value?.handlePointerEvent(e, {
    onPointerDown: (event, container) => {
      if (drawingController.value?.onPointerDown(event, container)) {
        store.actions.setDrawings(drawingController.value.getDrawings())
        store.actions.bumpDrawingVersion()
        return true
      }
      return false
    },
  })
}

function onPointerMove(e: PointerEvent) {
  const container = containerRef.value
  if (container) {
    const rect = getContainerRect(container)
    mousePos.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }
  chartRef.value?.handlePointerEvent(e, {
    onPointerMove: (event, container) => {
      if (drawingController.value?.onPointerMove(event, container)) {
        store.actions.setDrawings(drawingController.value.getDrawings())
        return true
      }
      return false
    },
  })
}

function onPointerUp(e: PointerEvent) {
  chartRef.value?.handlePointerEvent(e, {
    onPointerUp: (event, container) => {
      if (drawingController.value?.onPointerUp(event, container)) {
        store.actions.setDrawings(drawingController.value.getDrawings())
        return true
      }
      return false
    },
  })
}

function onPointerLeave(e: PointerEvent) {
  // pointerleave 不需要绘图控制器路由，直接调用
  chartRef.value?.handlePointerEvent(e)
}

function onRightAxisPointerDown(e: PointerEvent) {
  chartRef.value?.handlePointerEvent(e)
}

function onRightAxisPointerMove(e: PointerEvent) {
  chartRef.value?.handlePointerEvent(e)
}

function onRightAxisPointerUp(e: PointerEvent) {
  chartRef.value?.handlePointerEvent(e)
}

function onRightAxisPointerLeave(e: PointerEvent) {
  chartRef.value?.handlePointerEvent(e)
}

function onScroll() {
  chartRef.value?.handleScrollEvent()
}

// 主图指标显式状态（副图指标从 subPanes 派生）
const mainActiveIndicators = ref<string[]>([])

// 副图指标列表从 subPanes 自动派生
const subActiveIndicators = computed(() => {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const pane of subPanes.value) {
    if (!seen.has(pane.indicatorId)) {
      seen.add(pane.indicatorId)
      ids.push(pane.indicatorId)
    }
  }
  return ids
})

// 最终合并列表（主图 + 副图），保持显示顺序
const activeIndicators = computed(() => [
  ...mainActiveIndicators.value,
  ...subActiveIndicators.value,
])

// 指标参数配置（MA 的 periods 是数组，需要更宽松的类型）
const indicatorParams = ref<Record<string, Record<string, unknown>>>({})

// 副图槽位状态
interface SubPaneSlot {
  id: string // pane ID: 'RSI_0', 'MACD_0', ...
  indicatorId: SubIndicatorType
  params: Record<string, unknown>
}

// 副图槽位数组（支持多副图）
const subPanes = ref<SubPaneSlot[]>([])

// 最大副图数量
const maxSubPanes = 4

function buildPaneLayoutIntent(): PaneSpec[] {
  const mainRatio = paneRatios.value['main'] ?? 3
  return subPanes.value.length === 0
    ? [{ id: 'main', ratio: mainRatio, visible: true, role: 'price' }]
    : [
        { id: 'main', ratio: mainRatio, visible: true, role: 'price' },
        ...subPanes.value.map((pane) => ({
          id: pane.id,
          ratio: paneRatios.value[pane.id] ?? 1,
          visible: true,
          role: 'indicator' as const,
        })),
      ]
}

// 获取指标默认参数
function getDefaultParams(indicatorId: SubIndicatorType): Record<string, number | boolean | string> {
  return { ...SUB_PANE_INDICATOR_CONFIGS[indicatorId].defaultParams }
}

// 副图实例计数器：用于生成 'RSI_0', 'MACD_0' 这样的 paneId
const subPaneCounters = new Map<SubIndicatorType, number>()

function generatePaneId(indicatorId: SubIndicatorType): string {
  const count = subPaneCounters.get(indicatorId) ?? 0
  subPaneCounters.set(indicatorId, count + 1)
  return `${indicatorId}_${count}`
}

// paneTitle 渲染器名称映射（paneId -> rendererName）
const paneTitleRendererNames = new Map<string, string>()

function mountSubPaneTitle(paneId: string, indicatorId: SubIndicatorType): void {
  const paneTitleRenderer = createPaneTitleRendererPlugin({
    paneId,
    title: indicatorId,
    getTitleInfo: () => getSubPaneTitleInfo(paneId),
  })
  chartRef.value?.useRenderer(paneTitleRenderer)
  paneTitleRendererNames.set(paneId, paneTitleRenderer.name)
}

function unmountSubPaneTitle(paneId: string): void {
  const rendererName = paneTitleRendererNames.get(paneId)
  if (rendererName) {
    chartRef.value?.removeRenderer(rendererName)
    paneTitleRendererNames.delete(paneId)
  }
}

// 添加副图（使用 Chart API）
function addSubPane(
  indicatorId: SubIndicatorType = 'VOLUME',
  params?: Record<string, number | boolean | string>,
): boolean {
  if (subPanes.value.length >= maxSubPanes) {
    return false
  }

  const mergedParams = params ?? getDefaultParams(indicatorId)

  // 使用高层 Facade API 创建副图指标
  const paneId = chartRef.value?.addIndicator(indicatorId, 'sub', mergedParams)
  if (!paneId) return false

  // 创建 paneTitle 渲染器（UI 层职责）
  mountSubPaneTitle(paneId, indicatorId)

  // 更新本地状态
  subPanes.value.push({
    id: paneId,
    indicatorId,
    params: mergedParams,
  })

  scheduleRender()
  return true
}

// 移除副图（使用高层 Facade API）
function removeSubPane(paneId: string): void {
  const index = subPanes.value.findIndex((p) => p.id === paneId)
  if (index === -1) return

  const pane = subPanes.value[index]
  if (!pane) return

  // 移除 paneTitle 渲染器
  unmountSubPaneTitle(paneId)

  // 使用高层 Facade API 移除指标
  chartRef.value?.removeIndicator(paneId)

  // 更新本地状态
  subPanes.value.splice(index, 1)
}

// 清除所有副图（使用高层 Facade API）
function clearAllSubPanes(): void {
  // 使用高层 Facade API 逐个移除
  for (const pane of subPanes.value) {
    chartRef.value?.removeIndicator(pane.id)
    unmountSubPaneTitle(pane.id)
  }

  // 清空本地状态
  subPanes.value = []
  subPaneCounters.clear()
  paneTitleRendererNames.clear()
}

// 从语义化配置初始化指标状态（单向数据流：config → chart）
function initIndicatorsFromConfig(): void {
  const config = props.semanticConfig
  const chart = chartRef.value
  if (!chart) return

  // 初始化主图指标 - 直接调用Chart API
  const mainIndicators = config.indicators?.main
  if (mainIndicators) {
    for (const indicator of mainIndicators) {
      if (indicator.enabled) {
        // 同步Vue状态（用于UI展示）
        if (!mainActiveIndicators.value.includes(indicator.type)) {
          mainActiveIndicators.value.push(indicator.type)
        }
        // 保存参数
        if (indicator.params) {
          indicatorParams.value[indicator.type] = indicator.params as Record<string, unknown>
        }
        // 启用指标（Chart内部管理渲染器）
        chart.enableMainIndicator(
          indicator.type,
          indicator.params as Record<string, number | boolean | string>,
        )
      }
    }
  }

  // 副图指标参数由 syncSubPanesFromChart 处理
}

// 监听主图指标参数变化，同步到Chart（状态由Chart管理，Vue只同步参数）
watch(
  [activeIndicators, indicatorParams],
  ([indicators]) => {
    const chart = chartRef.value
    if (!chart) return

    // 只更新mainIndicatorLegend的配置（用于图例显示）
    // 渲染器的启用/禁用由Chart内部管理
    chart.updateRendererConfig('mainIndicatorLegend', {
      indicators: {
        MA: {
          enabled: indicators.includes('MA'),
          params: indicatorParams.value['MA'] || {},
        },
        BOLL: {
          enabled: indicators.includes('BOLL'),
          params: indicatorParams.value['BOLL'] || {},
        },
        EXPMA: {
          enabled: indicators.includes('EXPMA'),
          params: indicatorParams.value['EXPMA'] || {},
        },
        ENE: {
          enabled: indicators.includes('ENE'),
          params: indicatorParams.value['ENE'] || {},
        },
      },
    })

    scheduleRender()
  },
  { deep: true },
)

// 从 Chart 同步副图状态到本地（语义化配置后调用）
function syncSubPanesFromChart(): void {
  const chartSubPaneEntries = chartRef.value?.getSubPaneEntries() ?? []

  // 清空本地状态
  subPanes.value = []
  paneTitleRendererNames.clear()

  for (const entry of chartSubPaneEntries) {
    const { paneId, indicatorId, params } = entry

    // 恢复计数器状态
    const match = paneId.match(/^(.+)_(\d+)$/)
    if (match) {
      const [, indicator, countStr] = match
      const count = parseInt(countStr!, 10)
      const currentCount = subPaneCounters.get(indicator as SubIndicatorType) ?? 0
      if (count >= currentCount) {
        subPaneCounters.set(indicator as SubIndicatorType, count + 1)
      }
    }

    // 创建 paneTitle 渲染器
    mountSubPaneTitle(paneId, indicatorId)

    // 更新本地状态
    subPanes.value.push({
      id: paneId,
      indicatorId,
      params: { ...params },
    })
  }

  scheduleRender()
}

// 切换副图指标（使用 Chart API）
function switchSubIndicator(paneId: string, newIndicatorId: SubIndicatorType): void {
  const pane = subPanes.value.find((p) => p.id === paneId)
  if (!pane) return

  const nextParams = getDefaultParams(newIndicatorId)

  // 移除旧的 paneTitle 渲染器
  unmountSubPaneTitle(paneId)

  // 使用 Chart API 替换副图指标（paneId 不变，只换指标类型）
  chartRef.value?.replaceSubPaneIndicator(paneId, newIndicatorId, nextParams)

  // 创建新的 paneTitle 渲染器
  mountSubPaneTitle(paneId, newIndicatorId)

  // 更新本地状态（paneId 保持不变）
  const index = subPanes.value.findIndex((p) => p.id === paneId)
  if (index !== -1) {
    subPanes.value[index] = {
      id: paneId,
      indicatorId: newIndicatorId,
      params: nextParams,
    }
  }
}

// 获取副图标题信息（带缓存，只在 crosshairIdx 或 data 变化时重算）
const _titleInfoCache = new Map<
  string,
  { idx: number | null; dataLen: number; result: TitleInfo | null }
>()

function getSubPaneTitleInfo(paneId: string): TitleInfo | null {
  const pane = subPanes.value.find((p) => p.id === paneId)
  if (!pane) return null

  const data = chartRef.value?.getData()
  if (!data || data.length === 0) return null

  const idx = crosshairIdx.value
  const dataLen = data.length

  // 缓存命中：crosshairIdx 和 dataLen 都没变
  const cached = _titleInfoCache.get(paneId)
  if (cached && cached.idx === idx && cached.dataLen === dataLen) {
    return cached.result
  }

  const config = SUB_PANE_INDICATOR_CONFIGS[pane.indicatorId]
  const params = pane.params as Record<string, number>
  const pluginHost = chartRef.value?.plugin
  const result = pluginHost ? config.getTitleInfo(data, idx, params, pluginHost, paneId) : null

  _titleInfoCache.set(paneId, { idx, dataLen, result })
  return result
}

// 指标切换处理（使用高层 Facade API）
function handleIndicatorToggle(indicatorId: string, active: boolean) {
  const chart = chartRef.value
  if (!chart) return

  // 主图指标处理
  const mainIndicatorIds = ['MA', 'BOLL', 'EXPMA', 'ENE', 'WMA', 'DEMA', 'TEMA', 'HMA', 'KAMA', 'SAR', 'SUPERTREND', 'KELTNER', 'DONCHIAN', 'ICHIMOKU', 'PIVOT', 'FIB', 'STRUCTURE', 'ZONES']
  if (mainIndicatorIds.includes(indicatorId)) {
    const existingIndicator = mainActiveIndicators.value.find(id => id === indicatorId)
    
    if (active && !existingIndicator) {
      // 添加主图指标
      chart.addIndicator(indicatorId, 'main', indicatorParams.value[indicatorId])
      mainActiveIndicators.value.push(indicatorId)
    } else if (!active && existingIndicator) {
      // 移除主图指标
      const instanceId = indicatorId.toUpperCase()
      chart.removeIndicator(instanceId)
      mainActiveIndicators.value = mainActiveIndicators.value.filter((id) => id !== indicatorId)
    }
    return
  }

  // 副图指标处理
  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    if (active) {
      // 如果已存在同类型指标 pane，跳过
      const existingPane = subPanes.value.find((p) => p.indicatorId === indicatorId)
      if (existingPane) return

      // 使用高层 API 添加副图指标
      const paneId = chart.addIndicator(indicatorId, 'sub', indicatorParams.value[indicatorId])
      if (paneId) {
        // 创建 paneTitle 渲染器
        mountSubPaneTitle(paneId, indicatorId as SubIndicatorType)
        // 同步本地状态
        subPanes.value.push({
          id: paneId,
          indicatorId: indicatorId as SubIndicatorType,
          params: { ...indicatorParams.value[indicatorId] },
        })
      } else if (subPanes.value.length > 0) {
        // 添加失败（可能达到上限），替换最后一个
        const lastPane = subPanes.value[subPanes.value.length - 1]
        switchSubIndicator(lastPane.id, indicatorId as SubIndicatorType)
      }
    } else {
      // 找到并移除该指标的所有 pane
      const panesToRemove = subPanes.value.filter((p) => p.indicatorId === indicatorId)
      panesToRemove.forEach((pane) => {
        chart.removeIndicator(pane.id)
        unmountSubPaneTitle(pane.id)
      })
      subPanes.value = subPanes.value.filter((p) => p.indicatorId !== indicatorId)
    }
    scheduleRender()
  }
}

// 更新主图指标图例配置
function updateMainIndicatorLegendConfig() {
  chartRef.value?.updateRendererConfig('mainIndicatorLegend', {
    indicators: {
      MA: {
        enabled: activeIndicators.value.includes('MA'),
        params: indicatorParams.value['MA'] || {},
      },
      BOLL: {
        enabled: activeIndicators.value.includes('BOLL'),
        params: indicatorParams.value['BOLL'] || {},
      },
      EXPMA: {
        enabled: activeIndicators.value.includes('EXPMA'),
        params: indicatorParams.value['EXPMA'] || {},
      },
      ENE: {
        enabled: activeIndicators.value.includes('ENE'),
        params: indicatorParams.value['ENE'] || {},
      },
    },
  })
}

// 指标参数更新处理
function handleUpdateParams(indicatorId: string, params: Record<string, unknown>) {
  // 保存参数配置
  indicatorParams.value[indicatorId] = params

  // 主图指标参数更新 - 使用Chart API
  if (
    indicatorId === 'MA' ||
    indicatorId === 'BOLL' ||
    indicatorId === 'EXPMA' ||
    indicatorId === 'ENE'
  ) {
    chartRef.value?.updateMainIndicatorParams(
      indicatorId,
      params as Record<string, number | boolean | string>,
    )
    scheduleRender()
    return
  }

  if (SUB_PANE_INDICATORS.includes(indicatorId as SubIndicatorType)) {
    subPanes.value
      .filter((p) => p.indicatorId === indicatorId)
      .forEach((pane) => {
        chartRef.value?.updateSubPaneParams(pane.id, params)
        pane.params = { ...params }
      })
    scheduleRender()
    return
  }

  scheduleRender()
}

function handleReorderSubIndicators(orderedIndicatorIds: string[]) {
  if (!orderedIndicatorIds.length || subPanes.value.length <= 1) return

  const validOrder = orderedIndicatorIds.filter((id): id is SubIndicatorType =>
    SUB_PANE_INDICATORS.includes(id as SubIndicatorType),
  )
  if (!validOrder.length) return

  const paneByIndicator = new Map(subPanes.value.map((pane) => [pane.indicatorId, pane] as const))
  const nextSubPanes: SubPaneSlot[] = []

  for (const indicatorId of validOrder) {
    const pane = paneByIndicator.get(indicatorId)
    if (pane) {
      nextSubPanes.push(pane)
      paneByIndicator.delete(indicatorId)
    }
  }

  if (nextSubPanes.length === 0) return

  for (const pane of subPanes.value) {
    if (paneByIndicator.has(pane.indicatorId)) {
      nextSubPanes.push(pane)
      paneByIndicator.delete(pane.indicatorId)
    }
  }

  const currentSubIds = subPanes.value.map((p) => p.id)
  const nextSubIds = nextSubPanes.map((p) => p.id)
  if (currentSubIds.join('|') === nextSubIds.join('|')) return

  subPanes.value = nextSubPanes

  // activeIndicators 由 computed 自动派生，无需手动同步

  const chart = chartRef.value
  if (!chart) return
  chart.updatePaneLayout(buildPaneLayoutIntent())
}

/* 计算总宽度：从 Vue 响应式状态读取，zoom 变化时自动重算 */
const axisHostWidth = computed(() => props.rightAxisWidth + props.priceLabelWidth)

const TRAILING_DRAWING_SLOTS_VAL = TRAILING_DRAWING_SLOTS

const totalWidth = store.computed.totalWidth

// 缩放由 Chart 回调驱动 scrollLeft 与渲染时序。

function scrollToRight() {
  const container = containerRef.value
  const chart = chartRef.value
  if (!container || !chart) return

  const dataLength = chart.getData()?.length ?? 0
  if (dataLength === 0) return

  const dpr = chart.getCurrentDpr()
  const { unitPx, startXPx } = getPhysicalKLineConfig(kWidth.value, kGap.value, dpr)

  // 计算最后一根K线的结束位置（不含 TRAILING_DRAWING_SLOTS）
  const lastKLineEndPx = (startXPx + dataLength * unitPx) / dpr

  // 计算最大可滚动距离
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)

  // 计算需要的滚动位置，使最后一根K线紧贴最右侧
  const targetScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, lastKLineEndPx - container.clientWidth),
  )

  container.scrollLeft = Math.round(targetScrollLeft * dpr) / dpr
  scheduleRender()
}

/* 缩放到指定级别（Vue 层驱动） */
function applyZoomToLevel(targetLevel: number, anchorX?: number) {
  const chart = chartRef.value
  const container = containerRef.value
  if (!chart || !container) return
  const dpr = chart.getCurrentDpr()
  const centerX = anchorX ?? (chart.getViewport()?.plotWidth ?? container.clientWidth) / 2
  const result = computeZoomToLevel(
    targetLevel,
    centerX,
    container.scrollLeft,
    zoomLevel.value,
    kWidth.value,
    kGap.value,
    {
      minKWidth: props.minKWidth,
      maxKWidth: props.maxKWidth,
      zoomLevelCount: props.zoomLevels,
      dpr,
    },
  )
  if (!result) return
  store.actions.setZoomState(result.targetLevel, result.newKWidth, result.newKGap)
  chart.interaction.clearHover()
  nextTick(() => {
    const c = containerRef.value
    if (!c) return
    const max = Math.max(0, c.scrollWidth - c.clientWidth)
    const clampedScrollLeft = Math.min(Math.max(0, result.newScrollLeft), max)
    c.scrollLeft = Math.round(clampedScrollLeft * dpr) / dpr
    chart.applyRenderState(result.newKWidth, result.newKGap, result.targetLevel)
    emit('zoomLevelChange', result.targetLevel, result.newKWidth)
  })
}

defineExpose({
  scheduleRender,
  scrollToRight,
  addSubPane,
  removeSubPane,
  switchSubIndicator,
  clearAllSubPanes,
  get plugin() {
    return chartRef.value?.plugin
  },

  // Zoom Level API（Vue SSOT）
  zoomToLevel: applyZoomToLevel,
  zoomIn: (anchorX?: number) => applyZoomToLevel(zoomLevel.value + 1, anchorX),
  zoomOut: (anchorX?: number) => applyZoomToLevel(zoomLevel.value - 1, anchorX),
  getZoomLevel: () => zoomLevel.value,
  getZoomLevelCount: () => chartRef.value?.getZoomLevelCount() ?? 10,
})

// ==================== onMounted 拆分函数 ====================

function setupWheelHandler(container: HTMLDivElement): (e: WheelEvent) => void {
  const onWheelHandler = (e: WheelEvent) => {
    e.preventDefault()
    const chart = chartRef.value
    if (!chart) return

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const scrollLeft = container.scrollLeft
    const dpr = chart.getCurrentDpr()

    const result = computeZoom(
      e.deltaY > 0 ? -1 : 1,
      mouseX,
      scrollLeft,
      zoomLevel.value,
      kWidth.value,
      kGap.value,
      {
        minKWidth: props.minKWidth,
        maxKWidth: props.maxKWidth,
        zoomLevelCount: props.zoomLevels,
        dpr,
      },
    )
    if (!result) return

    store.actions.setZoomState(result.targetLevel, result.newKWidth, result.newKGap)
    chart.interaction.clearHover()

    nextTick(() => {
      const c = containerRef.value
      if (!c) return
      const maxScrollLeft = Math.max(0, c.scrollWidth - c.clientWidth)
      const clampedScrollLeft = Math.min(Math.max(0, result.newScrollLeft), maxScrollLeft)
      c.scrollLeft = Math.round(clampedScrollLeft * dpr) / dpr
      chart.applyRenderState(result.newKWidth, result.newKGap, result.targetLevel)
      emit('zoomLevelChange', result.targetLevel, result.newKWidth)
    })
  }
  container.addEventListener('wheel', onWheelHandler, { passive: false })
  return onWheelHandler
}

function initChart(
  container: HTMLDivElement,
  canvasLayer: HTMLDivElement,
  rightAxisLayer: HTMLDivElement,
  xAxisCanvas: HTMLCanvasElement,
): Chart {
  const chart = new Chart(
    { container, canvasLayer, rightAxisLayer, xAxisCanvas },
    {
      yPaddingPx: props.yPaddingPx,
      rightAxisWidth: props.rightAxisWidth,
      bottomAxisHeight: props.bottomAxisHeight,
      priceLabelWidth: props.priceLabelWidth,
      minKWidth: props.minKWidth,
      maxKWidth: props.maxKWidth,
      panes: [{ id: 'main', ratio: 1 }],
      paneGap: 0,
      zoomLevels: props.zoomLevels,
      initialZoomLevel: props.initialZoomLevel,
    },
  )
  registerRenderers(chart)
  return chart
}

function registerRenderers(chart: Chart): void {
  chart.useRenderer(createGridLinesRendererPlugin())
  chart.useRenderer(createMARendererPlugin())
  chart.setRendererEnabled('ma', false)
  chart.useRenderer(createBOLLRendererPlugin())
  chart.setRendererEnabled('boll', false)
  chart.useRenderer(createEXPMARendererPlugin())
  chart.setRendererEnabled('expma', false)
  chart.useRenderer(createENERendererPlugin())
  chart.setRendererEnabled('ene', false)
  chart.useRenderer(createCandleRenderer())
  chart.useRenderer(createLastPriceLineRendererPlugin())
  chart.useRenderer(createLastPriceLabelRegistrarPlugin())
  chart.useRenderer(createCustomMarkersRenderer())

  const axisWidth = props.rightAxisWidth + props.priceLabelWidth
  const getAxisCrosshair = () => {
    const pos = chart.interaction.crosshairPos
    const price = chart.interaction.crosshairPrice
    const activePaneId = chart.interaction.activePaneId
    if (pos && price !== null) {
      return { y: pos.y, price, activePaneId }
    }
    return null
  }

  chart.useRenderer(
    createYAxisRendererPlugin({
      axisWidth,
      yPaddingPx: props.yPaddingPx,
      getCrosshair: getAxisCrosshair,
    }),
  )
  chart.useRenderer(
    createMainIndicatorLegendRendererPlugin({
      yPaddingPx: props.yPaddingPx,
    }),
  )

  // Scale renderers 由 SubPaneManager 在 addSubPane 时按需注册

  chart.useRenderer(
    createCrosshairRendererPlugin({
      getCrosshairState: () => ({
        pos: chart.interaction.crosshairPos,
        activePaneId: chart.interaction.activePaneId,
        isDragging: chart.interaction.isDraggingState(),
        price: chart.interaction.crosshairPrice,
      }),
    }),
  )
  chart.useRenderer(
    createTimeAxisRendererPlugin({
      height: props.bottomAxisHeight,
      getCrosshair: () => {
        const pos = chart.interaction.crosshairPos
        const idx = chart.interaction.crosshairIndex
        if (pos && idx !== null) {
          return { x: pos.x, index: idx }
        }
        return null
      },
    }),
  )
}

function setupChartCallbacks(chart: Chart): void {
  chart.setOnViewportChange((vp) => {
    invalidateContainerRectCache()
    if (store.state.viewportDpr !== vp.dpr) {
      store.actions.setViewportDpr(vp.dpr)
    }
    if (store.state.viewWidth !== vp.plotWidth) {
      store.actions.setViewWidth(vp.plotWidth)
    }

    const newKGap = kGapFromKWidth(store.state.kWidth, vp.dpr)
    const zoomStateChanged = store.state.kGap !== newKGap
    if (zoomStateChanged) {
      store.actions.setZoomState(store.state.zoomLevel, store.state.kWidth, newKGap)
    }

    const chartState = chart.getOption()
    if (chartState.kWidth !== store.state.kWidth || chartState.kGap !== newKGap) {
      chart.applyRenderState(store.state.kWidth, newKGap, store.state.zoomLevel)
    }
  })

  chart.setOnPaneLayoutChange((panes) => {
    invalidateContainerRectCache()
    const next: Record<string, number> = {}
    for (const pane of panes) {
      next[pane.id] = pane.ratio
    }
    store.actions.setPaneRatios(next)

    const renderers = chart.getPaneRenderers()
    const borderTop = containerRef.value
      ? parseInt(getComputedStyle(containerRef.value).borderTopWidth) || 0
      : 0
    paneSeparatorLines.value = renderers.slice(0, -1).map((renderer) => {
      const pane = renderer.getPane()
      return {
        id: pane.id,
        top: pane.top + pane.height + borderTop,
      }
    })
  })

  chart.setOnDataChange((data) => {
    store.actions.setDataLength(data.length)
    store.actions.bumpDataVersion()
  })
}

function applyInitialSettings(chart: Chart): void {
  const initialSettings = toolbarRef.value?.getSettings() ?? { showVolumePriceMarkers: true }
  chart.updateSettings(initialSettings)

  if (initialSettings.performanceTest10kKlines) {
    const testData = generate10kKLineData()
    console.time('updateData-10k')
    chart.updateData(testData)
    console.timeEnd('updateData-10k')
    store.actions.setDataLength(testData.length)
    store.actions.bumpDataVersion()
  }
}

function setupDrawingController(chart: Chart): void {
  drawingController.value = new DrawingInteractionController(chart)
  drawingController.value.setCallbacks({
    onDrawingCreated: (drawing) => {
      store.actions.setDrawings([...store.state.drawings, drawing])
      store.actions.setSelectedDrawingId(drawing.id)
    },
    onToolChange: () => {},
    onDrawingSelected: (drawing) => {
      store.actions.setSelectedDrawingId(drawing?.id ?? null)
    },
  })
}

function setupInteractionCallbacks(chart: Chart): void {
  chart.interaction.setTooltipAnchorPositioning(useAnchorPositioning.value)
  chart.interaction.setOnInteractionChange((snapshot) => {
    interactionState.value = snapshot
  })

  chart.interaction.setOnPinchZoom((delta, centerClientX) => {
    const container = containerRef.value
    if (!container || !chart) return
    const rect = container.getBoundingClientRect()
    const centerX = centerClientX - rect.left
    const scrollLeft = container.scrollLeft
    const dpr = chart.getCurrentDpr()

    const result = computeZoom(
      delta,
      centerX,
      scrollLeft,
      zoomLevel.value,
      kWidth.value,
      kGap.value,
      {
        minKWidth: props.minKWidth,
        maxKWidth: props.maxKWidth,
        zoomLevelCount: props.zoomLevels,
        dpr,
      },
    )
    if (!result) return

    store.actions.setZoomState(result.targetLevel, result.newKWidth, result.newKGap)
    chart.interaction.clearHover()

    nextTick(() => {
      const c = containerRef.value
      if (!c) return
      const maxScrollLeft = Math.max(0, c.scrollWidth - c.clientWidth)
      const clampedScrollLeft = Math.min(Math.max(0, result.newScrollLeft), maxScrollLeft)
      c.scrollLeft = Math.round(clampedScrollLeft * dpr) / dpr
      chart.applyRenderState(result.newKWidth, result.newKGap, result.targetLevel)
      emit('zoomLevelChange', result.targetLevel, result.newKWidth)
    })
  })

  interactionState.value = chart.interaction.getInteractionSnapshot()
  store.actions.setViewportDpr(chart.getCurrentDpr())
  chart.resize()
}

/** 语义化控制器：外部配置 → Chart API 的桥梁 */
function setupSemanticController(chart: Chart): void {
  semanticController.value = new SemanticChartController(chart)

  semanticController.value.on('config:error', (error) => {
    console.error('Semantic config error:', error)
  })

  // config:ready → Chart 侧已完成创建，Vue 回读状态
  semanticController.value.on('config:ready', () => {
    store.actions.setDataLength(chart.getData()?.length ?? 0)
    store.actions.bumpDataVersion()
    initIndicatorsFromConfig()
    syncSubPanesFromChart()
    nextTick(() => scrollToRight())
  })
  // 应用副图、主图配置
  semanticController.value.applyConfig(props.semanticConfig).then((result) => {
    if (result && !result.success) {
      console.error('Semantic config apply failed:', result.errors)
    }
  })
}

onMounted(() => {
  useAnchorPositioning.value = false

  const container = containerRef.value
  const canvasLayer = canvasLayerRef.value
  const rightAxisLayer = rightAxisLayerRef.value
  const xAxisCanvas = xAxisCanvasRef.value
  if (!container || !canvasLayer || !rightAxisLayer || !xAxisCanvas) return

  // 1) 滚轮缩放：passive:false 以阻止页面滚动
  const onWheelHandler = setupWheelHandler(container)

  // 2) 创建 Chart 实例并注册全部渲染器
  const chart = initChart(container, canvasLayer, rightAxisLayer, xAxisCanvas)
  chartRef.value = chart

  // 3) 视口 / 面板布局 / 数据变更回调
  setupChartCallbacks(chart)

  // 4) 同步 zoom 状态（Vue SSOT → Chart）
  chart.applyRenderState(store.state.kWidth, store.state.kGap, store.state.zoomLevel)

  // 5) 工具栏初始设置（含性能测试数据）
  applyInitialSettings(chart)

  // 6) 绘图交互控制器（线段/箭头等）
  setupDrawingController(chart)

  // 7) 十字线、捏合缩放、初始交互快照
  setupInteractionCallbacks(chart)

  // 8) 语义化配置控制器（最终驱动数据加载）
  setupSemanticController(chart)

  // 供 onUnmounted 移除 wheel 监听
  ;(chart as any).__onWheel = onWheelHandler
})

onUnmounted(() => {
  const chart = chartRef.value
  if (chart) {
    const onWheel = (chart as any).__onWheel as
      | ((this: HTMLElement, ev: WheelEvent) => any)
      | undefined
    const container = containerRef.value
    if (onWheel && container) container.removeEventListener('wheel', onWheel)
    chart.destroy()
  }
  chartRef.value = null
  drawingController.value = null
})

// kWidth/kGap 由 zoomLevel 派生，不再通过 props 直接修改
// 如需程序化控制缩放，请使用 expose 的 zoomToLevel/zoomIn/zoomOut 方法

// 监听 yPaddingPx 变化
watch(
  () => props.yPaddingPx,
  (newVal) => {
    chartRef.value?.updateOptions({ yPaddingPx: newVal })
  },
)

// 监听 semanticConfig 变化（唯一数据源）
watch(
  () => props.semanticConfig,
  async (newConfig, oldConfig) => {
    if (newConfig && newConfig !== oldConfig) {
      const result = await semanticController.value?.applyConfig(newConfig)
      if (result && !result.success) {
        console.error('Semantic config apply failed:', result.errors)
      }
    }
  },
  { deep: true },
)
</script>

<style scoped>
.chart-wrapper {
  /* CSS 变量支持自定义尺寸 */
  --kmap-height: var(--kmap-chart-height, 100%);
  --kmap-width: var(--kmap-chart-width, 100%);

  /* 让组件在父容器中居中显示 */
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--kmap-width);
  height: var(--kmap-height);
  min-height: 300px; /* 默认最小高度，确保容器有有效尺寸 */
  flex-direction: column;
}

.chart-stage {
  width: 95%;
  height: 85%;
  min-height: 255px;
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.chart-main {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: stretch;
  gap: 0;
  position: relative;
}

.pane-separator-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
}

.pane-separator-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px solid #e5e7eb;
  opacity: 1;
  box-sizing: border-box;
  transition:
    border-top-color 120ms ease,
    border-top-width 120ms ease,
    margin-top 120ms ease,
    opacity 120ms ease;
}

.pane-separator-line.is-active {
  border-top-color: #3b82f6;
  border-top-width: 2px;
  margin-top: -1px;
}

.chart-stage.is-resizing-pane,
.chart-stage.is-hovering-pane-separator {
  cursor: ns-resize;
}

.chart-stage.is-hovering-kline {
  cursor: pointer;
}

.chart-stage.is-hovering-right-axis {
  cursor: ns-resize;
}

.chart-stage.is-dragging {
  cursor: grabbing;
}

.chart-container {
  position: relative;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
  height: 100%;
  min-height: inherit;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border: 1px solid #e5e7eb;
  border-right: 0;
  border-radius: 6px 0 0 6px;
  box-sizing: border-box;
  background: #ffffff;

  /* ===== 移动端：屏蔽长按弹出菜单/选择等默认行为，避免影响交互 ===== */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  /* 禁止浏览器接管手势（如长按/双击缩放等），保留我们自定义的 pointer 拖拽/十字线逻辑 */
  touch-action: none;
}

.chart-container::-webkit-scrollbar {
  display: none;
}

.right-axis-host {
  position: relative;
  flex: 0 0 auto;
  height: 100%;
  min-height: inherit;
  box-sizing: border-box;
  background: #ffffff;
  overflow: visible;
  border: 1px solid #e5e7eb;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;

  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}

.scroll-content {
  height: 100%;
  min-height: inherit;
  position: relative;
}

/* 关键：sticky 固定在可视区域左上角 */
.canvas-layer {
  position: sticky;
  left: 0;
  top: 0;
  /* width/height 由 JS 在 render() 中设置为视口大小 */
  pointer-events: none;
}

.tooltip-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
}

.tooltip-anchor {
  position: absolute;
  width: 1px;
  height: 1px;
  pointer-events: none;
}

.tooltip-anchor.kline-tooltip-anchor.use-anchor {
  anchor-name: --kline-tooltip-anchor;
}

.tooltip-anchor.marker-tooltip-anchor.use-anchor {
  anchor-name: --marker-tooltip-anchor;
}

@media (max-width: 768px), (max-height: 640px) {
  .chart-stage {
    gap: 6px;
  }
}
</style>

<!-- 非 scoped 样式：用于动态创建的 canvas 元素 -->
<style>
/* plot canvas 基础样式 */
.plot-canvas {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
}

/* 右侧价格轴 */
.right-axis {
  position: absolute;
  display: block;
  left: 0;
}

/* 底部时间轴 */
.x-axis-canvas {
  position: absolute;
  left: 0;
  bottom: 0;
  display: block;
  z-index: 10;
}

.right-axis {
  z-index: 15;
}
</style>
