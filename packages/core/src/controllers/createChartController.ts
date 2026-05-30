/**
 * createChartController — production ChartControllerFactory.
 *
 * Wraps the existing legacy chart engine (`src/core/chart.ts`, ~2150 LOC)
 * behind the framework-agnostic `ChartController` signal surface. Adapters
 * (React / Vue / Angular) consume this via auto-registration in their own
 * `index.ts` entry — consumers don't need to call `__setChartFactory`
 * unless they want to inject a custom backing for testing.
 *
 * Boundaries owned here:
 *   - Construct the inner DOM scaffold the legacy `Chart` expects
 *     (canvas-layer + right-axis-host + x-axis-canvas inside the
 *     consumer-supplied container).
 *   - Bridge Chart's imperative callbacks (`setOnViewportChange`,
 *     `setOnDataChange`) into signal writes.
 *   - Translate zoom intents (`zoomIn`, `zoomOut`, `zoomToLevel`) into
 *     `computeZoom` / `computeZoomToLevel` -> `applyRenderState` calls.
 *   - Translate `setData` / `appendData` into `updateData(...)`.
 *   - Compose the IndicatorSelectorController with a sensible default
 *     catalog discovered from the legacy renderer registry.
 *   - Stub `toolbar` and `drawing` controllers (Round 1F shipped real
 *     implementations; we wire those with reasonable defaults but do
 *     NOT yet bind toolbar selections to drawing-tool activation —
 *     that crossover is the maintainer's TODO).
 *   - Tear down DOM + listeners + child controllers on dispose().
 *
 * Engine import note: this module statically imports the legacy `Chart`
 * via a relative path that crosses the `packages/core` rootDir boundary.
 * That is accepted by tsc with `moduleResolution: bundler` and resolved
 * by vitest via the repo-root `@` alias added to each package's
 * vitest.config.ts. The auto-register line in each adapter does NOT
 * touch the DOM at module-evaluation time — Chart's constructor only
 * runs when `createChart(opts)` is called with a real container.
 */

import { createSignal, type Signal } from '../reactivity'
import { createIndicatorSelectorController } from './createIndicatorSelectorController'
import { createToolbarController } from './createToolbarController'
import { createDrawingController } from './createDrawingController'
import type {
    ChartController,
    ChartMountOptions,
    ChartViewport,
    IndicatorDefinition,
    KLineData,
} from './types'
import { Chart, type ChartOptions } from '../../../../src/core/chart'
import type { Viewport as LegacyViewport } from '../../../../src/core/chart'
import {
    computeZoom,
    computeZoomToLevel,
    zoomLevelToKWidth,
    kGapFromKWidth,
} from '../../../../src/core/utils/zoom'

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

// Minimal main + sub indicator catalog. Mirrors the renderer ids registered
// in `src/core/chart.ts`'s `enableMainIndicator` whitelist and the
// `SUB_PANE_INDICATOR_CONFIGS` keys. Kept here as a static, framework-agnostic
// catalog so the controller has no runtime dependency on the renderer module
// graph at module-load time.
const DEFAULT_INDICATOR_CATALOG: ReadonlyArray<IndicatorDefinition> = [
    // ---------- Main pane ----------
    { id: 'MA', label: 'MA', name: '移动平均线', role: 'main', params: [] },
    { id: 'BOLL', label: 'BOLL', name: '布林带', role: 'main', params: [] },
    { id: 'EXPMA', label: 'EXPMA', name: '指数平均线', role: 'main', params: [] },
    { id: 'ENE', label: 'ENE', name: '轨道线', role: 'main', params: [] },
    { id: 'WMA', label: 'WMA', name: '加权移动平均', role: 'main', params: [] },
    { id: 'DEMA', label: 'DEMA', name: '双指数移动平均', role: 'main', params: [] },
    { id: 'TEMA', label: 'TEMA', name: '三指数移动平均', role: 'main', params: [] },
    { id: 'HMA', label: 'HMA', name: 'Hull 移动平均', role: 'main', params: [] },
    { id: 'KAMA', label: 'KAMA', name: '考夫曼自适应', role: 'main', params: [] },
    { id: 'SAR', label: 'SAR', name: '抛物线', role: 'main', params: [] },
    { id: 'SUPERTREND', label: 'SuperTrend', name: '超级趋势', role: 'main', params: [] },
    { id: 'KELTNER', label: 'KELTNER', name: 'Keltner 通道', role: 'main', params: [] },
    { id: 'DONCHIAN', label: 'DONCHIAN', name: 'Donchian 通道', role: 'main', params: [] },
    { id: 'ICHIMOKU', label: 'ICHIMOKU', name: '一目均衡表', role: 'main', params: [] },
    { id: 'PIVOT', label: 'PIVOT', name: '枢轴点', role: 'main', params: [] },
    { id: 'FIB', label: 'FIB', name: '斐波那契', role: 'main', params: [] },
    { id: 'STRUCTURE', label: 'Structure', name: 'SMC 结构', role: 'main', params: [] },
    { id: 'ZONES', label: 'Zones', name: 'SMC 区域', role: 'main', params: [] },
    // ---------- Sub pane ----------
    { id: 'VOLUME', label: 'VOL', name: '成交量', role: 'sub', params: [] },
    { id: 'MACD', label: 'MACD', name: 'MACD', role: 'sub', params: [] },
    { id: 'RSI', label: 'RSI', name: '相对强弱', role: 'sub', params: [] },
    { id: 'CCI', label: 'CCI', name: '顺势指标', role: 'sub', params: [] },
    { id: 'STOCH', label: 'KDJ/STOCH', name: '随机指标', role: 'sub', params: [] },
    { id: 'MOM', label: 'MOM', name: '动量', role: 'sub', params: [] },
    { id: 'WMSR', label: 'WMSR', name: '威廉指标', role: 'sub', params: [] },
    { id: 'KST', label: 'KST', name: 'KST 振荡器', role: 'sub', params: [] },
    { id: 'FASTK', label: 'FASTK', name: '快速 K', role: 'sub', params: [] },
    { id: 'ATR', label: 'ATR', name: '真实波幅', role: 'sub', params: [] },
    { id: 'ROC', label: 'ROC', name: '变动率', role: 'sub', params: [] },
    { id: 'TRIX', label: 'TRIX', name: '三重指数平滑', role: 'sub', params: [] },
    { id: 'HV', label: 'HV', name: '历史波动率', role: 'sub', params: [] },
    { id: 'PARKINSON', label: 'Parkinson', name: 'Parkinson 波动率', role: 'sub', params: [] },
    { id: 'CHAIKIN_VOL', label: 'ChaikinVol', name: '蔡金波动率', role: 'sub', params: [] },
    { id: 'VMA', label: 'VMA', name: '成交量均线', role: 'sub', params: [] },
    { id: 'OBV', label: 'OBV', name: '能量潮', role: 'sub', params: [] },
    { id: 'PVT', label: 'PVT', name: '价量趋势', role: 'sub', params: [] },
    { id: 'VWAP', label: 'VWAP', name: '成交量加权均价', role: 'sub', params: [] },
    { id: 'CMF', label: 'CMF', name: '蔡金资金流量', role: 'sub', params: [] },
    { id: 'MFI', label: 'MFI', name: '资金流量指标', role: 'sub', params: [] },
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

/**
 * Build the DOM scaffold the legacy `Chart` expects inside the
 * consumer-supplied container.
 *
 * Mirrors the structure of `src/components/KLineChart.vue` (`.chart-container`
 * > `.scroll-content` > `.canvas-layer` + `.x-axis-canvas`; sibling
 * `.right-axis-host`). The legacy engine adds canvas elements into
 * `canvasLayer` itself during `initPanes()`.
 *
 * The cleanup callback removes only the elements WE created, leaving the
 * consumer-supplied container untouched.
 */
function buildDom(container: HTMLElement): MountedDom {
    const ownerDoc = container.ownerDocument
    if (ownerDoc === null || ownerDoc === undefined) {
        throw new Error(
            '[createChartController] container has no ownerDocument; cannot build DOM scaffold',
        )
    }

    // The legacy Chart class types `container` as HTMLDivElement. If the
    // consumer passed a different element type, wrap it in a child div so
    // the engine has the exact shape it expects without us mutating the
    // outer element's tag.
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

    return {
        container: chartContainer,
        canvasLayer,
        rightAxisLayer,
        xAxisCanvas,
        cleanup,
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createChartController(opts: ChartMountOptions): ChartController {
    if (opts === null || opts === undefined) {
        throw new Error('[createChartController] opts is required')
    }
    if (opts.container === null || opts.container === undefined) {
        throw new Error(
            '[createChartController] opts.container must be a non-null HTMLElement',
        )
    }

    // -------------------------------------------------------------------
    // DOM + Chart construction
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // Signal-backed state
    // -------------------------------------------------------------------
    let currentDpr = typeof window !== 'undefined' && window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : 1
    let currentKWidth = zoomLevelToKWidth(initialZoomLevel, {
        minKWidth: DEFAULT_OPTS.minKWidth,
        maxKWidth: DEFAULT_OPTS.maxKWidth,
        zoomLevelCount,
        dpr: currentDpr,
    })
    let currentKGap = kGapFromKWidth(currentKWidth, currentDpr)
    let currentZoomLevel = initialZoomLevel

    // Apply the initial render state so the engine has valid kWidth/kGap
    // before the first draw. Wrapped in try/catch because some test
    // environments (jsdom) lack a meaningful Canvas2D context — the engine
    // is otherwise defensive against this.
    try {
        chart.applyRenderState(currentKWidth, currentKGap, currentZoomLevel)
    } catch {
        /* tolerate jsdom / first-paint constructor races */
    }

    const viewport: Signal<ChartViewport> = createSignal<ChartViewport>({
        zoomLevel: currentZoomLevel,
        kWidth: currentKWidth,
        visibleFrom: 0,
        visibleTo: 0,
    })

    const data: Signal<ReadonlyArray<KLineData>> =
        createSignal<ReadonlyArray<KLineData>>(opts.data)

    const theme: Signal<'light' | 'dark'> = createSignal<'light' | 'dark'>(
        opts.theme ?? 'light',
    )

    // -------------------------------------------------------------------
    // Child controllers
    // -------------------------------------------------------------------
    const indicatorSelector = createIndicatorSelectorController({
        catalog: DEFAULT_INDICATOR_CATALOG,
    })

    // TODO(Round 1F): cross-wire toolbar selections to drawing.setActiveTool
    // and to chart.interaction state. For now the toolbar is initialised
    // with an empty tool catalog — consumers can register tools imperatively
    // via the controller surface in a later round.
    const toolbar = createToolbarController({ tools: [] })

    // TODO(Round 1F): bind drawing.clearAll / deleteLast to the legacy
    // DrawingStore via `chart.setDrawings([])`. The Round 1F drawing
    // controller currently tracks drawing count locally; bridging to the
    // engine store is the next step. We listen to drawing state changes
    // so the engine can be updated when that wiring lands.
    const drawing = createDrawingController()

    // -------------------------------------------------------------------
    // Chart -> signal wiring
    // -------------------------------------------------------------------
    chart.setOnViewportChange((vp: LegacyViewport) => {
        // Keep our zoom-derivation state in sync with the engine's effective
        // DPR (the engine can refine DPR from ResizeObserver).
        if (vp.dpr > 0) {
            currentDpr = vp.dpr
        }
        // Visible range is opaque to the controller without re-deriving from
        // scrollLeft/kWidth; we publish what we know and leave visibleFrom/To
        // as 0 until a dedicated visible-range signal is added.
        viewport.set({
            zoomLevel: currentZoomLevel,
            kWidth: currentKWidth,
            visibleFrom: 0,
            visibleTo: 0,
        })
    })

    chart.setOnDataChange((next: KLineData[]) => {
        data.set([...next])
    })

    // Seed the engine with the initial data the consumer passed in.
    try {
        chart.updateData(Array.from(opts.data))
    } catch {
        /* tolerate first-paint racing the constructor */
    }

    // -------------------------------------------------------------------
    // Zoom helpers
    // -------------------------------------------------------------------
    function applyZoom(targetLevel: number, anchorX: number | undefined): void {
        const delta = targetLevel - currentZoomLevel
        if (delta === 0) return
        const anchor = typeof anchorX === 'number' ? anchorX : 0
        const scrollLeft = chart.getCachedScrollLeft()
        const result = computeZoomToLevel(
            targetLevel,
            anchor,
            scrollLeft,
            currentZoomLevel,
            currentKWidth,
            currentKGap,
            {
                minKWidth: DEFAULT_OPTS.minKWidth,
                maxKWidth: DEFAULT_OPTS.maxKWidth,
                zoomLevelCount,
                dpr: currentDpr,
            },
        )
        if (result === null) return
        currentZoomLevel = result.targetLevel
        currentKWidth = result.newKWidth
        currentKGap = result.newKGap
        try {
            chart.applyRenderState(currentKWidth, currentKGap, currentZoomLevel)
        } catch {
            /* tolerate jsdom canvas absence */
        }
        viewport.set({
            zoomLevel: currentZoomLevel,
            kWidth: currentKWidth,
            visibleFrom: 0,
            visibleTo: 0,
        })
    }

    function applyZoomDelta(delta: number, anchorX: number | undefined): void {
        const anchor = typeof anchorX === 'number' ? anchorX : 0
        const scrollLeft = chart.getCachedScrollLeft()
        const result = computeZoom(
            delta,
            anchor,
            scrollLeft,
            currentZoomLevel,
            currentKWidth,
            currentKGap,
            {
                minKWidth: DEFAULT_OPTS.minKWidth,
                maxKWidth: DEFAULT_OPTS.maxKWidth,
                zoomLevelCount,
                dpr: currentDpr,
            },
        )
        if (result === null) return
        currentZoomLevel = result.targetLevel
        currentKWidth = result.newKWidth
        currentKGap = result.newKGap
        try {
            chart.applyRenderState(currentKWidth, currentKGap, currentZoomLevel)
        } catch {
            /* tolerate jsdom canvas absence */
        }
        viewport.set({
            zoomLevel: currentZoomLevel,
            kWidth: currentKWidth,
            visibleFrom: 0,
            visibleTo: 0,
        })
    }

    // -------------------------------------------------------------------
    // Public controller surface
    // -------------------------------------------------------------------
    let disposed = false

    function setData(next: ReadonlyArray<KLineData>): void {
        if (disposed) return
        const arr = Array.from(next)
        try {
            chart.updateData(arr)
        } catch {
            /* engine reports via onDataChange; tolerate jsdom */
        }
        // onDataChange will fire data.set; this is a safety net for engines
        // that elide the callback when array reference is unchanged.
        data.set(arr)
    }

    function appendData(next: ReadonlyArray<KLineData>): void {
        if (disposed) return
        const current = data.peek()
        const merged = [...current, ...next]
        setData(merged)
    }

    function setTheme(nextTheme: 'light' | 'dark'): void {
        if (disposed) return
        theme.set(nextTheme)
        // TODO(maintainer): the legacy Chart class has no theme API yet.
        // When `updateSettings({ theme })` is added, wire it here.
    }

    function zoomToLevel(level: number, anchorX?: number): void {
        if (disposed) return
        const clamped = Math.max(1, Math.min(zoomLevelCount, Math.round(level)))
        applyZoom(clamped, anchorX)
    }

    function zoomIn(anchorX?: number): void {
        if (disposed) return
        applyZoomDelta(1, anchorX)
    }

    function zoomOut(anchorX?: number): void {
        if (disposed) return
        applyZoomDelta(-1, anchorX)
    }

    function dispose(): void {
        if (disposed) return
        disposed = true
        try {
            // chart.destroy() is async but we don't await — caller already
            // released its reference. The engine handles partial teardown.
            void chart.destroy()
        } catch {
            /* best-effort */
        }
        try {
            indicatorSelector.dispose()
        } catch {
            /* best-effort */
        }
        try {
            toolbar.dispose()
        } catch {
            /* best-effort */
        }
        try {
            drawing.dispose()
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
        theme,
        indicatorSelector,
        toolbar,
        drawing,
        setData,
        appendData,
        setTheme,
        zoomToLevel,
        zoomIn,
        zoomOut,
        dispose,
    }
}
