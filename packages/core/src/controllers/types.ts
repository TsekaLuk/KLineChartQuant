/**
 * Framework-agnostic controller interfaces.
 *
 * Every adapter (React, Vue, Angular) consumes these. Controllers expose state as
 * `Signal<T>` so adapters bridge with their own reactivity (useSyncExternalStore,
 * shallowRef, toSignal).
 *
 * Mutation methods are imperative — adapters call them in event handlers.
 */

import type { Signal } from '../reactivity'

// ---------------------------------------------------------------------------
// Data shapes (mirror src/types/price.ts — single source of truth lives here
// long-term; the legacy types re-export from here once migration completes)
// ---------------------------------------------------------------------------

export interface KLineData {
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume?: number
    turnover?: number
    stockCode?: string
    amplitude?: number
    changePercent?: number
    changeAmount?: number
    turnoverRate?: number
}

// ---------------------------------------------------------------------------
// Indicator metadata
// ---------------------------------------------------------------------------

export type IndicatorPaneRole = 'main' | 'sub'
export type IndicatorRole = 'main' | 'sub'

export interface IndicatorParamDef {
    key: string
    label: string
    type: 'number' | 'string' | 'boolean' | 'color' | 'select'
    default: number | string | boolean
    min?: number
    max?: number
    step?: number
    options?: ReadonlyArray<{ value: string; label: string }>
}

export interface IndicatorDefinition {
    key?: string
    label?: string
    name?: string
    description?: string
    role?: IndicatorPaneRole
    params?: ReadonlyArray<IndicatorParamDef>
    id: string
}

// ---------------------------------------------------------------------------
// Indicator instance (live on the chart engine)
// ---------------------------------------------------------------------------

export interface IndicatorInstance {
    id: string
    definitionId: string
    label: string
    name: string
    role: IndicatorRole
    paneId?: string
    params: Record<string, unknown>
}

export interface SubPaneInfo {
    paneId: string
    indicatorId: string
    params: Record<string, unknown>
    ratio: number
}

// ---------------------------------------------------------------------------
// Drawing types
// ---------------------------------------------------------------------------

export type DrawingToolType = 'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow'

export interface DrawingObject {
    id: string
    type: DrawingToolType
}

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

export interface InteractionSnapshot {
    crosshairPos: { x: number; y: number } | null
    crosshairIndex: number | null
    crosshairPrice: number | null
    hoveredIndex: number | null
    activePaneId: string | null
    isDragging: boolean
    isResizingPane: boolean
    isHoveringRightAxis: boolean
    cursor: 'default' | 'crosshair' | 'grabbing' | 'pointer' | 'ns-resize'
}

// ---------------------------------------------------------------------------
// Drawing controller callback type (passed to handlePointerEvent)
// ---------------------------------------------------------------------------

export interface DrawingControllerCallbacks {
    onPointerDown?: (e: PointerEvent, container: HTMLElement) => boolean
    onPointerMove?: (e: PointerEvent, container: HTMLElement) => boolean
    onPointerUp?: (e: PointerEvent, container: HTMLElement) => boolean
}

// ---------------------------------------------------------------------------
// ChartController — top-level facade; what `useChart` / `<KLineChart>` expose
// ---------------------------------------------------------------------------

export interface ChartMountOptions {
    container: HTMLElement
    data: ReadonlyArray<KLineData>
    initialZoomLevel?: number
    zoomLevels?: number
    theme?: 'light' | 'dark'
}

export interface ChartViewport {
    zoomLevel: number
    plotWidth: number
    plotHeight: number
    dpr: number
    visibleFrom: number
    visibleTo: number
    desiredScrollLeft: number | undefined
    kWidth: number
    kGap: number
}

export interface ChartController {
    // ---- Signals ----
    readonly viewport: Signal<ChartViewport>
    readonly data: Signal<ReadonlyArray<KLineData>>
    readonly theme: Signal<'light' | 'dark'>
    readonly indicators: Signal<ReadonlyArray<IndicatorInstance>>
    readonly subPanes: Signal<ReadonlyArray<SubPaneInfo>>
    readonly drawingTool: Signal<DrawingToolType | null>
    readonly drawings: Signal<ReadonlyArray<DrawingObject>>
    readonly paneRatios: Signal<Readonly<Record<string, number>>>
    readonly interactionState: Signal<InteractionSnapshot>

    // indicator catalog (static — adapters use for picker UI)
    readonly catalog: ReadonlyArray<IndicatorDefinition>

    // ---- Data ----
    setData(next: ReadonlyArray<KLineData>): void
    appendData(next: ReadonlyArray<KLineData>): void

    // ---- Theme ----
    setTheme(theme: 'light' | 'dark'): void

    // ---- Zoom ----
    zoomToLevel(level: number, anchorX?: number): void
    zoomIn(anchorX?: number): void
    zoomOut(anchorX?: number): void

    // ---- Interaction ----
    handlePointerEvent(e: PointerEvent, drawingController?: DrawingControllerCallbacks): boolean
    handleWheelEvent(e: WheelEvent): void
    handleScrollEvent(): void
    handlePinchZoom(delta: number, centerClientX: number): void

    // ---- Indicators ----
    addIndicator(
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ): string | null
    removeIndicator(instanceId: string): boolean
    updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean

    // ---- Drawing ----
    setDrawingTool(tool: DrawingToolType | null): void
    clearDrawings(): void
    removeDrawing(drawingId: string): void

    // ---- Layout ----
    resizeSubPane(paneId: string, deltaY: number): boolean

    // ---- Settings ----
    updateOptionsFacade(options: Record<string, unknown>): void

    /** tear down DOM + listeners; idempotent */
    dispose(): void
}

/**
 * Factory contract — adapters call this on mount.
 *
 * Implementation lives in packages/core/src/controllers/createChartController.ts
 * (Phase 1 deliverable). It wires the existing Chart engine in src/core/chart.ts.
 */
export type ChartControllerFactory = (opts: ChartMountOptions) => ChartController

// ---------------------------------------------------------------------------
// Legacy type aliases (deprecated — kept for internal sub-controller tests)
// ---------------------------------------------------------------------------

/** @deprecated Use `IndicatorInstance` instead. Kept for createIndicatorSelectorController tests. */
export interface ActiveIndicator {
    id: string
    definitionId: string
    label: string
    name: string
    role: IndicatorPaneRole
    params: Readonly<Record<string, number | string | boolean>>
}

/** @deprecated Flattened into ChartController. Kept for createIndicatorSelectorController tests. */
export interface IndicatorSelectorController {
    readonly catalog: Signal<ReadonlyArray<IndicatorDefinition>>
    readonly active: Signal<ReadonlyArray<ActiveIndicator>>
    readonly menuOpen: Signal<boolean>
    readonly searchQuery: Signal<string>
    readonly filteredMain: Signal<ReadonlyArray<IndicatorDefinition>>
    readonly filteredSub: Signal<ReadonlyArray<IndicatorDefinition>>
    add(definitionId: string): string | null
    remove(instanceId: string): boolean
    updateParams(instanceId: string, params: Record<string, number | string | boolean>): boolean
    reorder(fromInstanceId: string, toInstanceId: string): boolean
    openMenu(): void
    closeMenu(): void
    toggleMenu(): void
    setSearchQuery(q: string): void
    isActive(definitionId: string): boolean
    dispose(): void
}

export type ToolId = string

export interface ToolDefinition {
    id: ToolId
    label: string
    icon?: string
    group?: string
    disabled?: boolean
}

/** @deprecated Flattened into ChartController. Kept for createToolbarController tests. */
export interface ToolbarController {
    readonly tools: Signal<ReadonlyArray<ToolDefinition>>
    readonly activeTool: Signal<ToolId | null>
    readonly disabledTools: Signal<ReadonlySet<ToolId>>
    selectTool(id: ToolId): void
    clearSelection(): void
    setDisabled(id: ToolId, disabled: boolean): void
    dispose(): void
}

export interface DrawingState {
    readonly activeTool: DrawingToolType | null
    readonly drawingCount: number
}

/** @deprecated Flattened into ChartController. Kept for createDrawingController tests. */
export interface DrawingController {
    readonly state: Signal<DrawingState>
    setActiveTool(tool: DrawingToolType | null): void
    clearAll(): void
    deleteLast(): void
    dispose(): void
}
