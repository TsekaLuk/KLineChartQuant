/** Inclusive timestamp range exposed to Agent consumers. */
export interface ChartAgentTimeRange {
  readonly from: number
  readonly to: number
}

/** Loaded timestamp coverage and bar count. */
export interface ChartAgentDataRange extends ChartAgentTimeRange {
  readonly bars: number
}

/** Serializable active-indicator projection. */
export interface ChartAgentActiveIndicator {
  readonly instanceId: string
  readonly definitionId: string
  readonly params: Readonly<Record<string, number>>
}

/** Minimum sufficient, detached chart context for Agent runs and tools. */
export interface ChartAgentContextSnapshot {
  readonly chartId: string
  readonly symbol: string | null
  readonly market: string | null
  readonly exchange: string | null
  readonly period: string | null
  readonly dataSource: string | null
  readonly timezone: string | null
  readonly adjustMode: string | null
  readonly dataRange: ChartAgentDataRange
  readonly visibleRange: ChartAgentTimeRange | null
  readonly activeIndicators: ReadonlyArray<ChartAgentActiveIndicator>
  readonly chartRevision: number
  readonly dataRevision: number
}

/** Bounded state required by Renderer tool postcondition checks. */
export interface ChartAgentStateSnapshot {
  readonly chartId: string
  readonly chartRevision: number
  readonly dataRevision: number
  readonly theme: 'light' | 'dark'
  readonly zoomLevel: number
  readonly visibleRange: ChartAgentTimeRange | null
  readonly activeIndicators: ReadonlyArray<ChartAgentActiveIndicator>
  readonly comparisonSymbols: ReadonlyArray<string>
  readonly drawingIds: ReadonlyArray<string>
  readonly markerIds: ReadonlyArray<string>
}

/** Actual viewport result after a timestamp-range navigation transaction. */
export interface ChartAgentVisibleRangeResult {
  readonly visibleRange: ChartAgentTimeRange
  readonly clampedFrom: boolean
  readonly clampedTo: boolean
  readonly zoomLevel: number
  readonly chartRevision: number
}

/** Bounded parameters accepted by the compact indicator query. */
export interface IndicatorQueryInput {
  readonly definitionId: string
  readonly params?: Readonly<Record<string, number>>
  readonly from?: number
  readonly to?: number
  readonly limit?: number
}

/** Stable Agent-facing facade attached to every ChartController. */
export interface ChartAgentController {
  getContext(): ChartAgentContextSnapshot
  getState(): ChartAgentStateSnapshot
  setVisibleRange(input: ChartAgentTimeRange): ChartAgentVisibleRangeResult
  queryIndicator(input: IndicatorQueryInput): Promise<string>
}
