import { describe, expect, it, vi } from 'vitest'

import { createDataState } from '../../../engine/state/dataState'
import { createSignal } from '../../../foundation/reactivity/signal'
import { createChartAgentController, createChartRevisionTracker } from '../chartAgentController'
import { CHART_AGENT_ERROR_CODES } from '../errors'

import type {
  ChartViewport,
  DrawingObject,
  IndicatorInstance,
  SymbolSpec,
} from '../../../controllers/types'
import type { CustomMarkerEntity } from '../../../engine/marker/registry'
import type { KLineData } from '../../../foundation/types/price'

const BAR_SELECTION = {
  kind: 'bars' as const,
  instrumentKey: 'TEST',
  sourceId: 'fixture',
  period: 'daily' as const,
  adjustment: 'none' as const,
}

function createBars(): KLineData[] {
  return [1_000, 2_000, 3_000, 4_000].map((timestamp) => ({
    timestamp,
    open: timestamp,
    high: timestamp + 1,
    low: timestamp - 1,
    close: timestamp,
    volume: 100,
  }))
}

function publishBars(dataState: ReturnType<typeof createDataState>, bars = createBars()): void {
  dataState.actions.applyActiveBufferSnapshot({
    kind: 'bars',
    selection: BAR_SELECTION,
    data: bars,
    loading: false,
    error: null,
    timeShareRange: null,
    timeSharePreClose: null,
  })
}

function createFixture() {
  const dataState = createDataState()
  publishBars(dataState)

  const currentSpec = createSignal<SymbolSpec | null>({
    symbol: 'BTCUSDT',
    market: 'crypto',
    exchange: 'BINANCE',
    period: 'daily',
    adjust: 'none',
    source: 'fixture',
  })
  const viewport = createSignal<ChartViewport>({
    zoomLevel: 3,
    plotWidth: 800,
    plotHeight: 500,
    dpr: 2,
    visibleFrom: 1,
    visibleTo: 4,
    kWidth: 8,
    kGap: 2,
  })
  const indicatorParams = { period: 14, showLabel: true, invalid: Number.NaN }
  const indicators = createSignal<ReadonlyArray<IndicatorInstance>>([
    {
      id: 'rsi-1',
      definitionId: 'RSI',
      label: 'RSI',
      name: 'RSI',
      role: 'sub',
      paneId: 'rsi-pane',
      params: indicatorParams,
    },
  ])
  const chartRevision = createSignal(7)
  const theme = createSignal<'light' | 'dark'>('dark')
  const symbols = createSignal<ReadonlyArray<SymbolSpec>>([
    currentSpec.peek()!,
    { symbol: 'ETHUSDT', market: 'crypto', exchange: 'BINANCE' },
  ])
  const drawings = createSignal<ReadonlyArray<DrawingObject>>([
    { id: 'drawing-1' } as DrawingObject,
  ])
  const customMarkers = createSignal<ReadonlyMap<string, CustomMarkerEntity>>(
    new Map([['agent-marker-1', { id: 'agent-marker-1' } as CustomMarkerEntity]]),
  )
  const queryIndicator = vi.fn<(input: unknown) => Promise<string>>(async () => 'RSI compact text')
  const setVisibleRange = vi.fn<(range: { from: number; to: number }) => object>(() => ({
    visibleRange: { from: 1_000, to: 3_000 },
    clampedFrom: false,
    clampedTo: false,
    zoomLevel: 4,
    chartRevision: 8,
  }))
  const controller = createChartAgentController({
    chartId: 'chart-fixture',
    dataState,
    currentSpec,
    viewport,
    indicators,
    theme,
    symbols,
    drawings,
    customMarkers,
    chartRevision,
    indicatorQuery: { queryIndicator },
    setVisibleRange,
  })

  return {
    chartRevision,
    controller,
    currentSpec,
    dataState,
    indicatorParams,
    indicators,
    queryIndicator,
    setVisibleRange,
  }
}

describe('createChartAgentController', () => {
  it('returns a detached, deeply immutable, serializable context snapshot', () => {
    const fixture = createFixture()

    const snapshot = fixture.controller.getContext()

    expect(snapshot).toEqual({
      chartId: 'chart-fixture',
      symbol: 'BTCUSDT',
      market: 'crypto',
      exchange: 'BINANCE',
      period: 'daily',
      dataSource: 'fixture',
      timezone: null,
      adjustMode: 'none',
      dataRange: { from: 1_000, to: 4_000, bars: 4 },
      visibleRange: { from: 2_000, to: 4_000 },
      activeIndicators: [{ instanceId: 'rsi-1', definitionId: 'RSI', params: { period: 14 } }],
      chartRevision: 7,
      dataRevision: 1,
    })
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.dataRange)).toBe(true)
    expect(Object.isFrozen(snapshot.visibleRange)).toBe(true)
    expect(Object.isFrozen(snapshot.activeIndicators)).toBe(true)
    expect(Object.isFrozen(snapshot.activeIndicators[0])).toBe(true)
    expect(Object.isFrozen(snapshot.activeIndicators[0]?.params)).toBe(true)

    fixture.currentSpec.set({ symbol: 'ETHUSDT', market: 'crypto' })
    fixture.indicatorParams.period = 9
    fixture.chartRevision.set(8)

    expect(snapshot.symbol).toBe('BTCUSDT')
    expect(snapshot.activeIndicators[0]?.params.period).toBe(14)
    expect(snapshot.chartRevision).toBe(7)
  })

  it('returns a stable chart identity and fresh read-only snapshots', () => {
    const fixture = createFixture()

    const first = fixture.controller.getContext()
    const second = fixture.controller.getContext()

    expect(first).not.toBe(second)
    expect(first.chartId).toBe(second.chartId)
    expect(first.chartRevision).toBe(second.chartRevision)
  })

  it('returns a bounded immutable state projection and delegates exact navigation', () => {
    const fixture = createFixture()

    const state = fixture.controller.getState()
    expect(state).toEqual({
      chartId: 'chart-fixture',
      chartRevision: 7,
      dataRevision: 1,
      theme: 'dark',
      zoomLevel: 3,
      visibleRange: { from: 2_000, to: 4_000 },
      activeIndicators: [{ instanceId: 'rsi-1', definitionId: 'RSI', params: { period: 14 } }],
      comparisonSymbols: ['ETHUSDT'],
      drawingIds: ['drawing-1'],
      markerIds: ['agent-marker-1'],
    })
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.comparisonSymbols)).toBe(true)
    expect(Object.isFrozen(state.drawingIds)).toBe(true)
    expect(Object.isFrozen(state.markerIds)).toBe(true)

    const input = { from: 1_000, to: 3_000 }
    expect(fixture.controller.setVisibleRange(input)).toEqual({
      visibleRange: input,
      clampedFrom: false,
      clampedTo: false,
      zoomLevel: 4,
      chartRevision: 8,
    })
    expect(fixture.setVisibleRange).toHaveBeenCalledWith(input)
  })

  it('throws a typed no-data error for an absent or empty active series', () => {
    const fixture = createFixture()
    fixture.dataState.actions.reset()

    expect(() => fixture.controller.getContext()).toThrowError(
      expect.objectContaining({ code: CHART_AGENT_ERROR_CODES.NO_DATA }),
    )

    publishBars(fixture.dataState, [])
    expect(() => fixture.controller.getContext()).toThrowError(
      expect.objectContaining({ code: CHART_AGENT_ERROR_CODES.NO_DATA }),
    )
  })

  it('delegates indicator queries and preserves compact text verbatim', async () => {
    const fixture = createFixture()
    const input = { definitionId: 'RSI', params: { period: 14 }, limit: 20 }

    await expect(fixture.controller.queryIndicator(input)).resolves.toBe('RSI compact text')
    expect(fixture.queryIndicator).toHaveBeenCalledOnce()
    expect(fixture.queryIndicator).toHaveBeenCalledWith(input)
  })
})

describe('createChartRevisionTracker', () => {
  it('increments monotonically for tracked changes and ignores reads', () => {
    const symbol = createSignal('BTCUSDT')
    const theme = createSignal<'light' | 'dark'>('dark')
    const tracker = createChartRevisionTracker([symbol, theme])

    expect(tracker.revision.peek()).toBe(0)
    symbol.peek()
    theme()
    expect(tracker.revision.peek()).toBe(0)

    symbol.set('ETHUSDT')
    const afterSymbol = tracker.revision.peek()
    theme.set('light')

    expect(afterSymbol).toBeGreaterThan(0)
    expect(tracker.revision.peek()).toBeGreaterThan(afterSymbol)
  })

  it('stops observing changes after dispose', () => {
    const state = createSignal(0)
    const tracker = createChartRevisionTracker([state])
    state.set(1)
    const beforeDispose = tracker.revision.peek()

    tracker.dispose()
    tracker.dispose()
    state.set(2)

    expect(tracker.revision.peek()).toBe(beforeDispose)
  })
})
