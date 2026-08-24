import { CANONICAL_TOOL_REGISTRY } from './toolRegistry.js'

import type {
  ChartController,
  DrawingToolId,
  KLineData,
  ToolCall,
  ToolResult,
} from '@363045841yyt/klinechart-core'

export type { ToolCall, ToolResult }

function failed(error: string): ToolResult {
  return { success: false, error }
}

function succeeded(name: string, data: unknown = {}): ToolResult {
  const validated = CANONICAL_TOOL_REGISTRY.validateOutput(name, data)
  if (!validated.ok) {
    return failed(`INVALID_TOOL_OUTPUT: ${validated.issues.map((issue) => issue.path).join(', ')}`)
  }
  return Object.keys(data as Record<string, unknown>).length === 0
    ? { success: true }
    : { success: true, data }
}

// follow-ignore-next-line complexity
export function executeTool(chart: ChartController, call: ToolCall): ToolResult {
  const definition = CANONICAL_TOOL_REGISTRY.find(call.name)
  if (!definition) {
    return failed(`UNKNOWN_TOOL: ${call.name}`)
  }
  if (!definition.policy.syncCompatible) {
    return failed(`SYNC_TOOL_UNSUPPORTED: ${call.name}`)
  }
  const validatedInput = CANONICAL_TOOL_REGISTRY.validateInput(call.name, call.input)
  if (!validatedInput.ok)
    return failed(
      `INVALID_ARGUMENTS: ${validatedInput.issues.map((issue) => `${issue.path}:${issue.keyword}`).join(', ')}`,
    )

  switch (call.name) {
    case 'chart.zoomToLevel': {
      const { level, anchorX } = call.input as {
        level: number
        anchorX?: number
      }
      chart.zoomToLevel(level, anchorX)
      return succeeded(call.name)
    }

    case 'chart.setTheme': {
      const { theme } = call.input as { theme: 'light' | 'dark' }
      chart.setTheme(theme)
      return succeeded(call.name)
    }

    case 'chart.scrollToRight': {
      chart.scrollToRight()
      return succeeded(call.name)
    }

    case 'chart.zoomIn': {
      const { anchorX } = call.input as { anchorX?: number }
      chart.zoomIn(anchorX)
      return succeeded(call.name)
    }

    case 'chart.zoomOut': {
      const { anchorX } = call.input as { anchorX?: number }
      chart.zoomOut(anchorX)
      return succeeded(call.name)
    }

    case 'indicators.add': {
      const { definitionId } = call.input as { definitionId: string }
      const def = chart.catalog.find((d) => d.id === definitionId)
      const role = def?.role ?? 'main'
      const instanceId = chart.addIndicator(definitionId, role)
      return succeeded(call.name, { instanceId: instanceId ?? null })
    }

    case 'indicators.remove': {
      const { instanceId } = call.input as { instanceId: string }
      const ok = chart.removeIndicator(instanceId)
      return ok ? succeeded(call.name) : failed(`INDICATOR_NOT_FOUND: ${instanceId}`)
    }

    case 'indicators.updateParams': {
      const { instanceId, params } = call.input as {
        instanceId: string
        params: Record<string, unknown>
      }
      const ok = chart.updateIndicatorParams(instanceId, params)
      return ok ? succeeded(call.name) : failed(`INDICATOR_NOT_FOUND: ${instanceId}`)
    }

    case 'data.setSymbols': {
      const symbolInput = call.input as {
        symbol: string
        market?: string
        exchange?: string
        period?: string
        adjust?: string
        source?: string
        startDate?: string
        endDate?: string
      }
      if (!symbolInput.market) return failed(`AMBIGUOUS_INSTRUMENT: ${symbolInput.symbol}`)
      chart.setSymbols([
        {
          symbol: symbolInput.symbol,
          market: symbolInput.market,
          exchange: symbolInput.exchange,
          period: symbolInput.period,
          adjust: symbolInput.adjust,
          source: symbolInput.source,
          startDate: symbolInput.startDate,
          endDate: symbolInput.endDate,
        },
      ])
      return succeeded(call.name)
    }

    case 'data.appendData': {
      const { bars } = call.input as {
        bars: Array<{
          timestamp?: number
          open: number
          high: number
          low: number
          close: number
          volume?: number
        }>
      }
      chart.appendData(bars as KLineData[])
      return succeeded(call.name)
    }

    case 'data.updateData': {
      const { bars } = call.input as {
        bars: Array<{
          timestamp?: number
          open: number
          high: number
          low: number
          close: number
          volume?: number
        }>
      }
      chart.updateData(bars as KLineData[])
      return succeeded(call.name)
    }

    case 'data.addComparisonSymbol': {
      const comparisonInput = call.input as {
        symbol: string
        market?: string
        exchange?: string
        source?: string
      }
      if (!comparisonInput.market) return failed(`AMBIGUOUS_INSTRUMENT: ${comparisonInput.symbol}`)
      chart.addComparisonSymbol({
        symbol: comparisonInput.symbol,
        market: comparisonInput.market,
        exchange: comparisonInput.exchange,
        source: comparisonInput.source,
      })
      return succeeded(call.name)
    }

    case 'data.removeComparisonSymbol': {
      const { symbol } = call.input as { symbol: string }
      chart.removeComparisonSymbol(symbol)
      return succeeded(call.name)
    }

    case 'drawing.setTool': {
      const { tool } = call.input as { tool: string | null }
      chart.setDrawingTool(tool as DrawingToolId | null)
      return succeeded(call.name)
    }

    case 'drawing.add': {
      const drawingInput = call.input as {
        kind: string
        anchors: Array<{ barIndex: number; price: number }>
        style?: Record<string, unknown>
      }
      const existing = chart.getFullDrawings()
      const newDrawing: Record<string, unknown> = {
        id: crypto.randomUUID(),
        kind: drawingInput.kind,
        paneId: 'main',
        visible: true,
        anchors: drawingInput.anchors.map((anchor, index) => ({
          id: `a-${Date.now()}-${index}`,
          index: anchor.barIndex,
          price: anchor.price,
        })),
        params: {},
        style: {
          stroke: '#2962ff',
          strokeWidth: 1,
          fillOpacity: 0.1,
          ...drawingInput.style,
        },
      }
      chart.setDrawings([...existing, newDrawing])
      return succeeded(call.name, { drawingId: newDrawing.id })
    }

    case 'drawing.clear': {
      chart.clearDrawings()
      return succeeded(call.name)
    }

    case 'drawing.remove': {
      const { drawingId } = call.input as { drawingId: string }
      chart.removeDrawing(drawingId)
      return succeeded(call.name)
    }

    case 'markers.update': {
      const { markers } = call.input as {
        markers: Array<{
          id: string
          date: string
          shape: string
          groupKey?: string
          style?: Record<string, unknown>
          label?: { text: string; position?: string }
        }>
      }
      chart.updateCustomMarkers(
        markers.map((marker) =>
          Object.assign({}, marker, { timestamp: new Date(marker.date).getTime() }),
        ) as Parameters<typeof chart.updateCustomMarkers>[0],
      )
      return succeeded(call.name)
    }

    case 'markers.clear': {
      chart.clearCustomMarkers()
      return succeeded(call.name)
    }

    case 'settings.update': {
      const { settings, options } = call.input as {
        settings?: Record<string, unknown>
        options?: Record<string, unknown>
      }
      if (settings) chart.updateSettingsFacade(settings)
      if (options) chart.updateOptionsFacade(options)
      return succeeded(call.name)
    }

    case 'alerts.addPriceCross':
    case 'alerts.addIndicatorCross':
    case 'alerts.remove': {
      return failed(`SYNC_TOOL_UNSUPPORTED: ${call.name}`)
    }

    case 'replay.seekTo':
    case 'replay.play':
    case 'replay.pause':
    case 'replay.setSpeed': {
      return failed(`SYNC_TOOL_UNSUPPORTED: ${call.name}`)
    }

    default: {
      return failed(`NO_HANDLER: ${call.name}`)
    }
  }
}
