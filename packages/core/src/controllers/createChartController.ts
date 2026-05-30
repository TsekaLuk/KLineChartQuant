/**
 * createChartController — production ChartControllerFactory.
 *
 * Wraps the legacy chart engine (`src/core/chart.ts`) behind the
 * framework-agnostic `ChartController` signal surface. Adapters
 * (React / Vue / Angular) consume this.
 *
 * Boundaries owned here:
 *   - Construct the inner DOM scaffold the legacy `Chart` expects.
 *   - Bridge Chart's facade signals into controller-owned signals.
 *   - Delegate zoom / interaction / indicator / drawing methods to Chart.
 *   - Tear down DOM + listeners on dispose().
 */

import { createSignal, type Signal } from '../reactivity'
import type {
    ChartController,
    ChartMountOptions,
    ChartViewport,
    DrawingToolType,
    DrawingObject,
    SubPaneInfo,
    IndicatorInstance,
    InteractionSnapshot,
    DrawingControllerCallbacks,
    IndicatorDefinition,
    KLineData,
} from './types'
import { Chart, type ChartOptions, type Viewport as LegacyViewport } from '../../../../src/core/chart'
import { zoomLevelToKWidth, kGapFromKWidth } from '../../../../src/core/utils/zoom'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_OPTS = {
    yPaddingPx: 0,
    minKWidth: 1,
    maxKWidth: 50,
    rightAxisWidth: 0,
    bottomAxisHeight: 24,
    priceLabelWidth: 60,
    zoomLevels: 20,
    initialZoomLevel: 3,
} as const

const INITIAL_INTERACTION: InteractionSnapshot = {
    crosshairPos: null,
    crosshairIndex: null,
    crosshairPrice: null,
    hoveredIndex: null,
    activePaneId: null,
    isDragging: false,
    isResizingPane: false,
    isHoveringRightAxis: false,
    cursor: 'default',
}

// ---------------------------------------------------------------------------
// Indicator catalog (mirrors renderer ids registered in the engine)
// ---------------------------------------------------------------------------

const DEFAULT_INDICATOR_CATALOG: ReadonlyArray<IndicatorDefinition> = [
    { id: 'MA', label: 'MA', name: '移动平均线', role: 'main', params: [] },
    { id: 'BOLL', label: 'BOLL', name: '布林带', role: 'main', params: [] },
    { id: 'EXPMA', label: 'EXPMA', name: '指数平均线', role: 'main', params: [] },
    { id: 'ENE', label: 'ENE', name: '轨道线', role: 'main', params: [] },
    { id: 'SAR', label: 'SAR', name: '抛物线', role: 'main', params: [] },
    { id: 'SUPERTREND', label: 'SuperTrend', name: '超级趋势', role: 'main', params: [] },
    { id: 'STRUCTURE', label: 'Structure', name: 'SMC 结构', role: 'main', params: [] },
    { id: 'ZONES', label: 'Zones', name: 'SMC 区域', role: 'main', params: [] },
    { id: 'VOLUME', label: 'VOL', name: '成交量', role: 'sub', params: [] },
    { id: 'MACD', label: 'MACD', name: 'MACD', role: 'sub', params: [] },
    { id: 'RSI', label: 'RSI', name: '相对强弱', role: 'sub', params: [] },
    { id: 'CCI', label: 'CCI', name: '顺势指标', role: 'sub', params: [] },
    { id: 'STOCH', label: 'KDJ/STOCH', name: '随机指标', role: 'sub', params: [] },
    { id: 'MOM', label: 'MOM', name: '动量', role: 'sub', params: [] },
    { id: 'WMSR', label: 'WMSR', name: '威廉指标', role: 'sub', params: [] },
    { id: 'KST', label: 'KST', name: 'KST 振荡器', role: 'sub', params: [] },
    { id: 'FASTK', label: 'FASTK', name: '快速 K', role: 'sub', params: [] },
    { id: 'OBV', label: 'OBV', name: '能量潮', role: 'sub', params: [] },
    { id: 'VWAP', label: 'VWAP', name: '成交量加权均价', role: 'sub', params: [] },
    { id: 'VOLUME_PROFILE', label: 'VP', name: '成交量分布', role: 'sub', params: [] },
]

// ---------------------------------------------------------------------------
// DOM scaffolding
// ---------------------------------------------------------------------------

interface MountedDom {
    container: HTMLDivElement
    canvasLayer: HTMLDivElement
    rightAxisLayer: HTMLDivElement
    xAxisCanvas: HTMLCanvasElement
    cleanup: () => void
}

function buildDom(container: HTMLElement): MountedDom {
    const ownerDoc = container.ownerDocument
    if (!ownerDoc) {
        throw new Error(
            '[createChartController] container has no ownerDocument; cannot build DOM scaffold',
        )
    }

    let chartContainer: HTMLDivElement
    let containerCreatedByUs = false
    if (container instanceof HTMLDivElement) {
        chartContainer = container
    } else {
        chartContainer = ownerDoc.createElement('div')
        chartContainer.style.width = '100%'
        chartContainer.style.height = '100%'
        chartContainer.style.position = 'relative'
        chartContainer.style.overflow = 'auto'
        container.appendChild(chartContainer)
        containerCreatedByUs = true
    }

    const scrollContent = ownerDoc.createElement('div')
    scrollContent.className = 'klc-scroll-content'
    scrollContent.style.position = 'relative'

    const canvasLayer = ownerDoc.createElement('div')
    canvasLayer.className = 'klc-canvas-layer'
    canvasLayer.style.position = 'sticky'
    canvasLayer.style.top = '0'
    canvasLayer.style.left = '0'

    const xAxisCanvas = ownerDoc.createElement('canvas')
    xAxisCanvas.className = 'klc-x-axis-canvas'

    canvasLayer.appendChild(xAxisCanvas)
    scrollContent.appendChild(canvasLayer)
    chartContainer.appendChild(scrollContent)

    const rightAxisLayer = ownerDoc.createElement('div')
    rightAxisLayer.className = 'klc-right-axis-host'
    rightAxisLayer.style.position = 'absolute'
    rightAxisLayer.style.top = '0'
    rightAxisLayer.style.right = '0'
    chartContainer.appendChild(rightAxisLayer)

    const cleanup = (): void => {
        try {
            scrollContent.remove()
            rightAxisLayer.remove()
            if (containerCreatedByUs) {
                chartContainer.remove()
            }
        } catch {
            /* DOM may already be gone — best effort */
        }
    }

    return { container: chartContainer, canvasLayer, rightAxisLayer, xAxisCanvas, cleanup }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createChartController(opts: ChartMountOptions): ChartController {
    if (!opts) {
        throw new Error('[createChartController] opts is required')
    }
    if (!opts.container) {
        throw new Error('[createChartController] opts.container must be a non-null HTMLElement')
    }

    const mounted = buildDom(opts.container)
    const initialZoomLevel = opts.initialZoomLevel ?? DEFAULT_OPTS.initialZoomLevel
    const zoomLevelCount = opts.zoomLevels ?? DEFAULT_OPTS.zoomLevels

    const chartOptions: ChartOptions = {
        yPaddingPx: DEFAULT_OPTS.yPaddingPx,
        rightAxisWidth: DEFAULT_OPTS.rightAxisWidth,
        bottomAxisHeight: DEFAULT_OPTS.bottomAxisHeight,
        minKWidth: DEFAULT_OPTS.minKWidth,
        maxKWidth: DEFAULT_OPTS.maxKWidth,
        priceLabelWidth: DEFAULT_OPTS.priceLabelWidth,
        panes: [{ id: 'main', ratio: 1 }],
        paneGap: 0,
        zoomLevels: zoomLevelCount,
        initialZoomLevel,
    }

    const chart = new Chart(
        {
            container: mounted.container,
            canvasLayer: mounted.canvasLayer,
            rightAxisLayer: mounted.rightAxisLayer,
            xAxisCanvas: mounted.xAxisCanvas,
        },
        chartOptions,
    )

    const currentDpr = typeof window !== 'undefined' && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : 1
    const currentKWidth = zoomLevelToKWidth(initialZoomLevel, {
        minKWidth: DEFAULT_OPTS.minKWidth,
        maxKWidth: DEFAULT_OPTS.maxKWidth,
        zoomLevelCount,
        dpr: currentDpr,
    })
    const currentKGap = kGapFromKWidth(currentKWidth, currentDpr)

    // -------------------------------------------------------------------
    // Controller signals (bridge mode: subscribe to Chart's signals)
    // -------------------------------------------------------------------

    const viewport: Signal<ChartViewport> = createSignal<ChartViewport>({
        zoomLevel: initialZoomLevel,
        plotWidth: 0,
        plotHeight: 0,
        dpr: currentDpr,
        visibleFrom: 0,
        visibleTo: 0,
        desiredScrollLeft: undefined,
        kWidth: currentKWidth,
        kGap: currentKGap,
    })

    const data: Signal<ReadonlyArray<KLineData>> = createSignal(opts.data)

    const themeSignal: Signal<'light' | 'dark'> = createSignal(opts.theme ?? 'light')

    const indicators: Signal<ReadonlyArray<IndicatorInstance>> = createSignal<
        ReadonlyArray<IndicatorInstance>
    >([])
    const subPanes: Signal<ReadonlyArray<SubPaneInfo>> = createSignal<ReadonlyArray<SubPaneInfo>>([])
    const drawingTool: Signal<DrawingToolType | null> = createSignal<DrawingToolType | null>(null)
    const drawings: Signal<ReadonlyArray<DrawingObject>> = createSignal<ReadonlyArray<DrawingObject>>([])
    const paneRatios: Signal<Readonly<Record<string, number>>> = createSignal<
        Readonly<Record<string, number>>
    >({})
    const interactionState: Signal<InteractionSnapshot> = createSignal(INITIAL_INTERACTION)

    // -------------------------------------------------------------------
    // Apply initial render state + seed data
    // -------------------------------------------------------------------

    try {
        chart.applyRenderState(currentKWidth, currentKGap, initialZoomLevel)
    } catch {
        /* tolerate jsdom */
    }

    try {
        chart.setData([...opts.data])
    } catch {
        /* tolerate first-paint racing */
    }

    // Apply initial theme if non-default
    if (opts.theme && opts.theme !== 'light') {
        chart.setTheme(opts.theme)
    }

    // -------------------------------------------------------------------
    // Signal bridges — subscribe to Chart's facade signals and forward
    // -------------------------------------------------------------------

    const unsubs: Array<() => void> = []

    // viewport: after zoom/scroll through facade methods
    unsubs.push(
        chart.viewport.subscribe(() => {
            const vp = chart.viewport.peek()
            viewport.set({
                zoomLevel: vp.zoomLevel,
                plotWidth: vp.plotWidth,
                plotHeight: vp.plotHeight,
                dpr: vp.dpr,
                visibleFrom: vp.visibleFrom,
                visibleTo: vp.visibleTo,
                desiredScrollLeft: vp.desiredScrollLeft,
                kWidth: vp.kWidth,
                kGap: vp.kGap,
            })
        }),
    )

    // data
    unsubs.push(
        chart.data.subscribe(() => data.set(chart.data.peek())),
    )

    // theme
    unsubs.push(
        chart.theme.subscribe(() => themeSignal.set(chart.theme.peek())),
    )

    // indicators
    unsubs.push(
        chart.indicators.subscribe(() => indicators.set(chart.indicators.peek())),
    )

    // subPanes
    unsubs.push(
        chart.subPanes.subscribe(() => subPanes.set(chart.subPanes.peek())),
    )

    // drawingTool
    unsubs.push(
        chart.drawingTool.subscribe(() => drawingTool.set(chart.drawingTool.peek())),
    )

    // drawings
    unsubs.push(
        chart.drawings.subscribe(() => drawings.set(chart.drawings.peek())),
    )

    // paneRatios
    unsubs.push(
        chart.paneRatios.subscribe(() => paneRatios.set(chart.paneRatios.peek())),
    )

    // interactionState
    unsubs.push(
        chart.interactionState.subscribe(() => interactionState.set(chart.interactionState.peek())),
    )

    // -------------------------------------------------------------------
    // Legacy callback for resize (chart's viewport signal doesn't fire
    // on resize — only on zoom/scroll through facade methods)
    // -------------------------------------------------------------------

    chart.setOnViewportChange((vp: LegacyViewport) => {
        const current = viewport.peek()
        viewport.set({
            ...current,
            plotWidth: vp.plotWidth,
            plotHeight: vp.plotHeight,
            dpr: vp.dpr > 0 ? vp.dpr : current.dpr,
        })
    })

    // -------------------------------------------------------------------
    // Lifecycle guard
    // -------------------------------------------------------------------

    let disposed = false

    // -------------------------------------------------------------------
    // Public methods — delegate to Chart facade
    // -------------------------------------------------------------------

    function setData(next: ReadonlyArray<KLineData>): void {
        if (disposed) return
        try {
            chart.setData([...next])
        } catch {
            /* tolerate jsdom */
        }
        // chart.setData updates chart._dataSignal — the bridge will relay
    }

    function appendData(next: ReadonlyArray<KLineData>): void {
        if (disposed) return
        const current = data.peek()
        const merged = [...current, ...next]
        setData(merged)
    }

    function setTheme(nextTheme: 'light' | 'dark'): void {
        if (disposed) return
        themeSignal.set(nextTheme)
        chart.setTheme(nextTheme)
    }

    function zoomToLevel(level: number, anchorX?: number): void {
        if (disposed) return
        chart.zoomToLevel(level, anchorX)
    }

    function zoomIn(anchorX?: number): void {
        if (disposed) return
        chart.zoomIn(anchorX)
    }

    function zoomOut(anchorX?: number): void {
        if (disposed) return
        chart.zoomOut(anchorX)
    }

    function handlePointerEvent(
        e: PointerEvent,
        drawingController?: DrawingControllerCallbacks,
    ): boolean {
        if (disposed) return false
        return chart.handlePointerEvent(e, drawingController)
    }

    function handleWheelEvent(e: WheelEvent): void {
        if (disposed) return
        chart.handleWheelEvent(e)
    }

    function handleScrollEvent(): void {
        if (disposed) return
        chart.handleScrollEvent()
    }

    function handlePinchZoom(delta: number, centerClientX: number): void {
        if (disposed) return
        chart.handlePinchZoom(delta, centerClientX)
    }

    function addIndicator(
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ): string | null {
        if (disposed) return null
        return chart.addIndicator(definitionId, role, params)
    }

    function removeIndicator(instanceId: string): boolean {
        if (disposed) return false
        return chart.removeIndicator(instanceId)
    }

    function updateIndicatorParams(
        instanceId: string,
        params: Record<string, unknown>,
    ): boolean {
        if (disposed) return false
        return chart.updateIndicatorParams(instanceId, params)
    }

    function setDrawingTool(tool: DrawingToolType | null): void {
        if (disposed) return
        chart.setDrawingTool(tool)
    }

    function clearDrawings(): void {
        if (disposed) return
        chart.clearDrawings()
    }

    function removeDrawing(drawingId: string): void {
        if (disposed) return
        chart.removeDrawing(drawingId)
    }

    function resizeSubPane(paneId: string, deltaY: number): boolean {
        if (disposed) return false
        return chart.resizeSubPane(paneId, deltaY)
    }

    function updateOptionsFacade(options: Record<string, unknown>): void {
        if (disposed) return
        chart.updateOptionsFacade(options)
    }

    function dispose(): void {
        if (disposed) return
        disposed = true
        // Unsubscribe all signal bridges first
        for (const unsub of unsubs) {
            try {
                unsub()
            } catch {
                /* best-effort */
            }
        }
        try {
            void chart.destroy()
        } catch {
            /* best-effort */
        }
        try {
            mounted.cleanup()
        } catch {
            /* best-effort */
        }
    }

    return {
        viewport,
        data,
        theme: themeSignal,
        indicators,
        subPanes,
        drawingTool,
        drawings,
        paneRatios,
        interactionState,
        catalog: DEFAULT_INDICATOR_CATALOG,
        setData,
        appendData,
        setTheme,
        zoomToLevel,
        zoomIn,
        zoomOut,
        handlePointerEvent,
        handleWheelEvent,
        handleScrollEvent,
        handlePinchZoom,
        addIndicator,
        removeIndicator,
        updateIndicatorParams,
        setDrawingTool,
        clearDrawings,
        removeDrawing,
        resizeSubPane,
        updateOptionsFacade,
        dispose,
    }
}
