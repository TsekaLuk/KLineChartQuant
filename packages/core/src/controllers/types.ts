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
    /** stable id, e.g. 'MA', 'BOLL', 'VOLUME_PROFILE' */
    id: string
    /** display label, e.g. 'MA' */
    label: string
    /** localized name, e.g. '移动平均线' */
    name: string
    /** short description for tooltips */
    description?: string
    /** which pane it draws to */
    role: IndicatorPaneRole
    /** parameter schema (empty array = no params) */
    params: ReadonlyArray<IndicatorParamDef>
}

export interface ActiveIndicator {
    /** instance id, unique across active indicators */
    id: string
    /** references IndicatorDefinition.id */
    definitionId: string
    label: string
    name: string
    role: IndicatorPaneRole
    /** current param values keyed by IndicatorParamDef.key */
    params: Readonly<Record<string, number | string | boolean>>
}

// ---------------------------------------------------------------------------
// IndicatorSelectorController — extracted from IndicatorSelector.vue
// ---------------------------------------------------------------------------

export interface IndicatorSelectorController {
    /** all indicators registered in the catalog */
    readonly catalog: Signal<ReadonlyArray<IndicatorDefinition>>
    /** currently active indicators, in display order */
    readonly active: Signal<ReadonlyArray<ActiveIndicator>>
    /** add menu open state */
    readonly menuOpen: Signal<boolean>
    /** search query for filtering catalog */
    readonly searchQuery: Signal<string>
    /** computed: catalog filtered by searchQuery, split by role */
    readonly filteredMain: Signal<ReadonlyArray<IndicatorDefinition>>
    readonly filteredSub: Signal<ReadonlyArray<IndicatorDefinition>>

    /** add an indicator by definition id; returns new active instance id, or null if already active */
    add(definitionId: string): string | null
    /** remove by instance id */
    remove(instanceId: string): boolean
    /** update params of an active instance */
    updateParams(instanceId: string, params: Record<string, number | string | boolean>): boolean
    /** reorder sub indicators (drag-drop) */
    reorder(fromInstanceId: string, toInstanceId: string): boolean
    /** menu */
    openMenu(): void
    closeMenu(): void
    toggleMenu(): void
    setSearchQuery(q: string): void
    /** is this definition currently active? */
    isActive(definitionId: string): boolean
    /** dispose all subscriptions */
    dispose(): void
}

// ---------------------------------------------------------------------------
// ToolbarController — extracted from LeftToolbar.vue
// ---------------------------------------------------------------------------

export type ToolId = string

export interface ToolDefinition {
    id: ToolId
    label: string
    icon?: string
    /** group id for radio-style mutually-exclusive selection */
    group?: string
    /** disabled state computed by controller */
    disabled?: boolean
}

export interface ToolbarController {
    readonly tools: Signal<ReadonlyArray<ToolDefinition>>
    readonly activeTool: Signal<ToolId | null>
    readonly disabledTools: Signal<ReadonlySet<ToolId>>

    selectTool(id: ToolId): void
    clearSelection(): void
    setDisabled(id: ToolId, disabled: boolean): void
    dispose(): void
}

// ---------------------------------------------------------------------------
// DrawingController — extracted from drawing/plugin.ts
// ---------------------------------------------------------------------------

export type DrawingToolType = 'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow'

export interface DrawingState {
    readonly activeTool: DrawingToolType | null
    readonly drawingCount: number
}

export interface DrawingController {
    readonly state: Signal<DrawingState>
    setActiveTool(tool: DrawingToolType | null): void
    clearAll(): void
    deleteLast(): void
    dispose(): void
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
    kWidth: number
    visibleFrom: number
    visibleTo: number
}

export interface ChartController {
    readonly viewport: Signal<ChartViewport>
    readonly data: Signal<ReadonlyArray<KLineData>>
    readonly theme: Signal<'light' | 'dark'>
    readonly indicatorSelector: IndicatorSelectorController
    readonly toolbar: ToolbarController
    readonly drawing: DrawingController

    setData(next: ReadonlyArray<KLineData>): void
    appendData(next: ReadonlyArray<KLineData>): void
    setTheme(theme: 'light' | 'dark'): void
    zoomToLevel(level: number, anchorX?: number): void
    zoomIn(anchorX?: number): void
    zoomOut(anchorX?: number): void
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
