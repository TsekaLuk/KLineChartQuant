import { describe, expect, it } from 'vitest'

import { executeToolAsync, type ToolExecutionIdentity } from '../canonicalExecutor'
import { ChartToolHost, FIRST_PARTY_CHART_TOOLS } from '../chartToolHost'
import { CANONICAL_TOOL_REGISTRY } from '../toolRegistry'

import type {
  ChartController,
  DrawingObject,
  IndicatorInstance,
  SymbolSpec,
} from '@363045841yyt/klinechart-core'

interface FixtureMarker {
  readonly id: string
  readonly date: string
  readonly timestamp: number
  readonly shape: 'circle'
  readonly metadata?: { readonly agentSessionId: string; readonly agentMarkerId: string }
}

const identity: ToolExecutionIdentity = {
  requestId: 'request-1',
  sessionId: 'session-1',
  runId: 'run-1',
  turnId: 'turn-1',
  toolCallId: 'call-1',
}

function signal<T>(read: () => T) {
  return { peek: read }
}

function createController() {
  let revision = 0
  let theme: 'light' | 'dark' = 'light'
  let zoomLevel = 3
  let visibleRange = { from: 1_000, to: 4_000 }
  let symbols: SymbolSpec[] = [
    { symbol: 'BTCUSDT', market: 'crypto', exchange: 'BINANCE', source: 'fixture' },
  ]
  let indicators: IndicatorInstance[] = []
  let drawings: DrawingObject[] = []
  let drawingTool = 'cursor'
  let markers = new Map<string, FixtureMarker>([
    [
      'user-marker',
      {
        id: 'user-marker',
        date: '2026-01-01',
        timestamp: Date.parse('2026-01-01'),
        shape: 'circle',
      },
    ],
  ])
  const bump = () => {
    revision += 1
  }
  const context = () => ({
    chartId: 'chart-1',
    symbol: symbols[0]?.symbol ?? null,
    market: symbols[0]?.market ?? null,
    exchange: symbols[0]?.exchange ?? null,
    period: symbols[0]?.period ?? 'daily',
    dataSource: symbols[0]?.source ?? null,
    timezone: null,
    adjustMode: symbols[0]?.adjust ?? null,
    dataRange: { from: 1_000, to: 4_000, bars: 4 },
    visibleRange,
    activeIndicators: indicators.map((indicator) => ({
      instanceId: indicator.id,
      definitionId: indicator.definitionId,
      params: indicator.params as Record<string, number>,
    })),
    chartRevision: revision,
    dataRevision: 1,
  })

  const controller = {
    agent: {
      getContext: context,
      getState: () => ({
        chartId: 'chart-1',
        chartRevision: revision,
        dataRevision: 1,
        theme,
        zoomLevel,
        visibleRange,
        activeIndicators: context().activeIndicators,
        comparisonSymbols: symbols.slice(1).map((spec) => spec.symbol),
        drawingIds: drawings.map((drawing) => drawing.id),
        markerIds: [...markers.keys()],
      }),
      setVisibleRange: (range: { from: number; to: number }) => {
        visibleRange = { ...range }
        bump()
        return {
          visibleRange,
          clampedFrom: false,
          clampedTo: false,
          zoomLevel,
          chartRevision: revision,
        }
      },
      queryIndicator: async () => 'RSI compact evidence',
    },
    theme: signal(() => theme),
    viewport: signal(() => ({
      zoomLevel,
      plotWidth: 800,
      plotHeight: 500,
      dpr: 2,
      visibleFrom: 0,
      visibleTo: 4,
      kWidth: 8,
      kGap: 2,
    })),
    symbols: signal(() => symbols),
    symbolCatalog: signal(() => [
      { symbol: 'BTCUSDT', market: 'crypto', exchange: 'BINANCE', source: 'fixture' },
      { symbol: 'BTCUSDT', market: 'us', exchange: 'NASDAQ', source: 'fixture' },
      { symbol: 'ETHUSDT', market: 'crypto', exchange: 'BINANCE', source: 'fixture' },
    ]),
    indicators: signal(() => indicators),
    catalog: [{ id: 'RSI', role: 'sub' }],
    drawings: signal(() => drawings),
    drawingTool: signal(() => drawingTool),
    customMarkers: signal(() => markers),
    setTheme: (next: 'light' | 'dark') => {
      theme = next
      bump()
    },
    scrollToRight: () => {
      visibleRange = { from: 2_000, to: 4_000 }
      bump()
    },
    zoomIn: () => {
      zoomLevel += 1
      bump()
    },
    zoomOut: () => {
      zoomLevel -= 1
      bump()
    },
    zoomToLevel: (level: number) => {
      zoomLevel = level
      bump()
    },
    setSymbols: (next: SymbolSpec[]) => {
      symbols = [...next]
      bump()
    },
    addComparisonSymbol: (spec: SymbolSpec) => {
      symbols = [...symbols, spec]
      bump()
    },
    addIndicator: (definitionId: string, role: 'main' | 'sub', params = {}) => {
      const id = `${definitionId}-${indicators.length + 1}`
      indicators = [
        ...indicators,
        { id, definitionId, role, params, label: definitionId, name: definitionId },
      ]
      bump()
      return id
    },
    removeIndicator: (id: string) => {
      const next = indicators.filter((indicator) => indicator.id !== id)
      if (next.length === indicators.length) return false
      indicators = next
      bump()
      return true
    },
    updateIndicatorParams: (id: string, params: Record<string, unknown>) => {
      const indicator = indicators.find((item) => item.id === id)
      if (!indicator) return false
      indicator.params = { ...params }
      bump()
      return true
    },
    getTimestampAtLogicalIndex: (index: number) => 1_000 + index * 1_000,
    getFullDrawings: () => drawings,
    setDrawings: (next: DrawingObject[]) => {
      drawings = [...next]
      bump()
    },
    clearDrawings: () => {
      drawings = []
      bump()
    },
    removeDrawing: (id: string) => {
      drawings = drawings.filter((drawing) => drawing.id !== id)
      bump()
    },
    setDrawingToolId: (tool: string) => {
      drawingTool = tool
      bump()
    },
    updateCustomMarkers: (next: FixtureMarker[]) => {
      markers = new Map(next.map((marker) => [marker.id, marker]))
      bump()
    },
  } as unknown as ChartController

  return {
    controller,
    read: () => ({ revision, theme, zoomLevel, symbols, indicators, drawings, markers }),
  }
}

describe('ChartToolHost', () => {
  it('projects exactly the implemented first-party allowlist', () => {
    const fixture = createController()
    const host = new ChartToolHost({ getController: () => fixture.controller })
    const names = CANONICAL_TOOL_REGISTRY.project(host.capabilityContext()).available.map(
      (tool) => tool.name,
    )

    expect(new Set(names)).toEqual(new Set(FIRST_PARTY_CHART_TOOLS))
    expect(names).not.toContain('data.appendData')
    expect(names).not.toContain('settings.update')
  })

  it('executes validated reads and preserves compact indicator text', async () => {
    const fixture = createController()
    const host = new ChartToolHost({ getController: () => fixture.controller })

    const state = await executeToolAsync({ name: 'chart.getState', input: {} }, identity, {
      capabilityContext: host.capabilityContext(),
      execute: host.executor(),
    })
    expect(state).toMatchObject({
      ok: true,
      data: { chartRevision: 0, zoomLevel: 3, markerIds: [] },
    })

    const query = await executeToolAsync(
      { name: 'indicators.query', input: { definitionId: 'RSI' } },
      identity,
      { capabilityContext: host.capabilityContext(), execute: host.executor() },
    )
    expect(query).toMatchObject({
      ok: true,
      data: { content: 'RSI compact evidence' },
      content: 'RSI compact evidence',
    })
  })

  it('serializes writes, verifies live state, and performs idempotent undo', async () => {
    const fixture = createController()
    let nextId = 0
    const host = new ChartToolHost({
      getController: () => fixture.controller,
      id: () => `opaque-${++nextId}`,
    })
    const result = await executeToolAsync(
      { name: 'chart.setTheme', input: { theme: 'dark' } },
      identity,
      {
        capabilityContext: host.capabilityContext(),
        execute: host.executor(0),
        verify: host.verifier(),
      },
    )

    expect(result).toMatchObject({
      ok: true,
      meta: { chartRevisionBefore: 0, chartRevisionAfter: 1, undoToken: 'opaque-1' },
    })
    expect(fixture.read().theme).toBe('dark')

    const undone = await host.undo('opaque-1', 1)
    expect(undone).toMatchObject({
      ok: true,
      meta: { chartRevisionBefore: 1, chartRevisionAfter: 2 },
    })
    expect(fixture.read().theme).toBe('light')
    await expect(host.undo('opaque-1', 2)).resolves.toMatchObject({
      ok: true,
      meta: { idempotentReplay: true },
    })
  })

  it('rejects stale writes and ambiguous instruments without mutation', async () => {
    const fixture = createController()
    const host = new ChartToolHost({ getController: () => fixture.controller })

    await expect(
      host.execute('chart.setTheme', { theme: 'dark' }, { identity, expectedChartRevision: 8 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'STATE_CONFLICT' } })
    expect(fixture.read().theme).toBe('light')

    await expect(
      host.execute(
        'data.setSymbols',
        { symbol: 'BTCUSDT' },
        { identity, expectedChartRevision: 0 },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'AMBIGUOUS_INSTRUMENT' } })
    expect(fixture.read().symbols).toHaveLength(1)
  })

  it('preserves user markers while replacing and clearing only session-owned markers', async () => {
    const fixture = createController()
    const host = new ChartToolHost({ getController: () => fixture.controller })
    const update = await host.execute(
      'markers.update',
      {
        markers: [{ id: 'entry', date: '2026-01-02', shape: 'flag' }],
      },
      { identity, expectedChartRevision: 0 },
    )
    expect(update.ok).toBe(true)
    expect([...fixture.read().markers.keys()]).toContain('user-marker')
    expect([...fixture.read().markers.keys()]).toContain('__kq_agent__session-1__entry')

    const clear = await host.execute(
      'markers.clear',
      {},
      { identity: { ...identity, toolCallId: 'call-2' }, expectedChartRevision: 1 },
    )
    expect(clear.ok).toBe(true)
    expect([...fixture.read().markers.keys()]).toEqual(['user-marker'])
  })
})
