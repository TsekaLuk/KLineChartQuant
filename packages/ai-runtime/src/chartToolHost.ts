import { CANONICAL_TOOL_REGISTRY } from './toolRegistry.js'

import type {
  ToolExecutionIdentity,
  ToolHostExecutor,
  ToolHostResult,
  ToolPostconditionVerifier,
} from './canonicalExecutor.js'
import type { PostconditionResult, ToolCapabilityContext, ToolError } from './toolRegistry.js'
import type {
  ChartController,
  DrawingObject,
  IndicatorInstance,
  SymbolInfo,
  SymbolSpec,
} from '@363045841yyt/klinechart-core'

export const FIRST_PARTY_CHART_TOOLS = Object.freeze([
  'agent.capabilities',
  'chart.getContext',
  'chart.getState',
  'chart.scrollToRight',
  'chart.setTheme',
  'chart.zoomIn',
  'chart.zoomOut',
  'chart.zoomToLevel',
  'data.setSymbols',
  'data.addComparisonSymbol',
  'data.removeComparisonSymbol',
  'drawing.add',
  'drawing.clear',
  'drawing.remove',
  'drawing.setTool',
  'indicators.add',
  'indicators.listActive',
  'indicators.query',
  'indicators.remove',
  'indicators.updateParams',
  'markers.clear',
  'markers.update',
  'navigation.setVisibleRange',
] as const)

export interface ChartToolHostOptions {
  readonly getController: () => ChartController | null | undefined
  readonly id?: () => string
  readonly maxUndoEntries?: number
}

export interface ChartToolExecutionOptions {
  readonly identity: ToolExecutionIdentity
  readonly expectedChartRevision?: number
  readonly signal?: AbortSignal
}

export interface ChartToolVerificationOptions {
  readonly identity: ToolExecutionIdentity
  readonly expectedChartRevision?: number
  readonly signal?: AbortSignal
}

export type ChartToolCapabilities =
  | {
      readonly ok: true
      readonly chartRevision: number
      readonly supportedTools: readonly string[]
    }
  | { readonly ok: false; readonly error: ToolError }

type DrawingTool = ReturnType<ChartController['drawingTool']['peek']>
type CustomMarkerEntity =
  ReturnType<ChartController['customMarkers']['peek']> extends ReadonlyMap<string, infer Marker>
    ? Marker
    : never
type MarkerInput = Omit<CustomMarkerEntity, 'timestamp' | 'metadata'>

interface ValidatedToolArguments {
  readonly adjust: SymbolSpec['adjust'] | undefined
  readonly anchorX: number | undefined
  readonly anchors: ReadonlyArray<{ readonly barIndex: number; readonly price: number }>
  readonly definitionId: string
  readonly drawingId: string
  readonly endDate: string | undefined
  readonly exchange: string | undefined
  readonly from: number
  readonly instanceId: string
  readonly kind: DrawingObject['kind']
  readonly level: number
  readonly market: string | undefined
  readonly markers: ReadonlyArray<MarkerInput>
  readonly params: Record<string, unknown>
  readonly period: SymbolSpec['period'] | undefined
  readonly source: string | undefined
  readonly startDate: string | undefined
  readonly style: DrawingObject['style'] | undefined
  readonly symbol: string
  readonly theme: 'light' | 'dark'
  readonly to: number
  readonly tool: unknown
}

interface ValidatedToolOutput {
  readonly drawingId: string
  readonly instanceId: string
  readonly visibleRange: Range
}

type UndoSnapshot =
  | { readonly kind: 'theme'; readonly theme: 'light' | 'dark' }
  | { readonly kind: 'viewport'; readonly zoomLevel: number; readonly range: Range | null }
  | { readonly kind: 'symbols'; readonly symbols: ReadonlyArray<SymbolSpec> }
  | { readonly kind: 'indicators'; readonly indicators: ReadonlyArray<IndicatorInstance> }
  | { readonly kind: 'drawings'; readonly drawings: ReadonlyArray<DrawingObject> }
  | { readonly kind: 'drawing-tool'; readonly tool: DrawingTool }
  | { readonly kind: 'markers'; readonly markers: ReadonlyArray<CustomMarkerEntity> }

interface Range {
  readonly from: number
  readonly to: number
}

interface UndoEntry {
  readonly token: string
  readonly snapshot: UndoSnapshot
  readonly chartId: string
  readonly revisionAfter: number
  result?: ToolHostResult
}

const supportedTools = new Set<string>(FIRST_PARTY_CHART_TOOLS)

function error(
  code: string,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
) {
  return { code, message, retryable, details } satisfies ToolError
}

function failure(
  code: string,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
): ToolHostResult {
  return { ok: false, error: error(code, message, retryable, details) }
}

function postconditionError(message: string, retryable = false, details?: Record<string, unknown>) {
  return { code: 'POSTCONDITION_FAILED' as const, message, retryable, details }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function normalize(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized || undefined
}

function stableSpecKey(spec: SymbolSpec): string {
  return [
    normalize(spec.symbol),
    normalize(spec.market),
    normalize(spec.exchange),
    normalize(spec.source ?? spec.instrument?.sourceId),
  ].join('|')
}

function infoToSpec(info: SymbolInfo): SymbolSpec {
  return {
    id: info.id,
    symbol: info.symbol,
    market: info.market,
    exchange: info.exchange,
    source: info.source,
    params: info.params,
  }
}

function resolveInstrument(
  controller: ChartController,
  input: { symbol: string; market?: string; exchange?: string; source?: string },
  candidates = [...controller.symbols.peek(), ...controller.symbolCatalog.peek().map(infoToSpec)],
): { ok: true; spec: SymbolSpec } | { ok: false; result: ToolHostResult } {
  const unique = new Map(candidates.map((spec) => [stableSpecKey(spec), spec]))
  const matches = [...unique.values()].filter((spec) => {
    if (normalize(spec.symbol) !== normalize(input.symbol)) return false
    if (input.market && normalize(spec.market) !== normalize(input.market)) return false
    if (input.exchange && normalize(spec.exchange) !== normalize(input.exchange)) return false
    const source = spec.source ?? spec.instrument?.sourceId
    return !input.source || normalize(source) === normalize(input.source)
  })
  if (matches.length === 1) return { ok: true, spec: clone(matches[0]!) }
  if (matches.length === 0) {
    return {
      ok: false,
      result: failure('INSTRUMENT_NOT_FOUND', 'No registered instrument matches the request.'),
    }
  }
  return {
    ok: false,
    result: failure('AMBIGUOUS_INSTRUMENT', 'The instrument identity is ambiguous.', false, {
      candidates: matches.slice(0, 20).map((spec) => ({
        symbol: spec.symbol,
        market: spec.market,
        exchange: spec.exchange,
        source: spec.source ?? spec.instrument?.sourceId,
      })),
    }),
  }
}

function isWrite(name: string): boolean {
  return CANONICAL_TOOL_REGISTRY.find(name)?.policy.safety !== 'read-only'
}

function sessionMarkerId(sessionId: string, markerId: string): string {
  return `__kq_agent__${sessionId}__${markerId}`
}

function publicMarkerIds(controller: ChartController, sessionId: string): string[] {
  const result: string[] = []
  for (const marker of controller.customMarkers.peek().values()) {
    if (marker.metadata?.agentSessionId !== sessionId) continue
    const publicId = marker.metadata.agentMarkerId
    if (typeof publicId === 'string') result.push(publicId)
  }
  const ordered: string[] = []
  for (const id of result) {
    const index = ordered.findIndex((current) => id.localeCompare(current) < 0)
    ordered.splice(index < 0 ? ordered.length : index, 0, id)
  }
  return ordered
}

function stateConflict(currentRevision: number): ToolHostResult {
  return failure('STATE_CONFLICT', 'The chart changed after the Agent observed it.', true, {
    currentChartRevision: currentRevision,
  })
}

function abortFailure(): ToolHostResult {
  return failure('CANCELLED', 'The Renderer tool request was cancelled.', true)
}

function toolKey(identity: ToolExecutionIdentity): string {
  return `${identity.sessionId}/${identity.runId}/${identity.toolCallId}`
}

export class ChartToolHost {
  readonly supportedTools: ReadonlySet<string> = supportedTools
  private readonly getController: ChartToolHostOptions['getController']
  private readonly id: () => string
  private readonly maxUndoEntries: number
  private readonly undoEntries = new Map<string, UndoEntry>()
  private readonly postconditions = new Map<string, { name: string; revisionAfter: number }>()
  private writeTail: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(options: ChartToolHostOptions) {
    this.getController = options.getController
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.maxUndoEntries = options.maxUndoEntries ?? 500
  }

  capabilityContext(audience: ToolCapabilityContext['audience'] = 'first-party') {
    return {
      audience,
      chartReady:
        !this.disposed && this.getController() !== null && this.getController() !== undefined,
      supportedTools: this.supportedTools,
    } satisfies ToolCapabilityContext
  }

  capabilities(): ChartToolCapabilities {
    const controller = this.getController()
    if (this.disposed || !controller) {
      return {
        ok: false,
        error: error('TARGET_GONE', 'No ready chart controller is registered.', true),
      }
    }
    try {
      const { chartRevision } = controller.agent.getContext()
      return {
        ok: true,
        chartRevision,
        supportedTools: [...this.supportedTools],
      }
    } catch {
      return {
        ok: false,
        error: error('TOOL_UNAVAILABLE', 'The chart is not ready for Agent tools.', true),
      }
    }
  }

  executor(expectedChartRevision?: number): ToolHostExecutor {
    return (name, input, context, signal) =>
      this.execute(name, input, {
        identity: context.identity,
        expectedChartRevision,
        signal,
      })
  }

  verifier(expectedChartRevision?: number): ToolPostconditionVerifier {
    return (name, input, output, context, signal) =>
      this.verify(name, input, output, {
        identity: context.identity,
        expectedChartRevision,
        signal,
      })
  }

  async execute(
    name: string,
    input: unknown,
    options: ChartToolExecutionOptions,
  ): Promise<ToolHostResult> {
    if (this.disposed) return failure('TARGET_GONE', 'The chart tool host has been disposed.', true)
    if (options.signal?.aborted) return abortFailure()
    if (!this.supportedTools.has(name)) {
      return failure('TOOL_UNAVAILABLE', 'The chart host does not implement this tool.')
    }
    if (!isWrite(name)) return this.executeRead(name, input, options.identity)

    let resolveResult!: (result: ToolHostResult) => void
    const result = new Promise<ToolHostResult>((resolve) => {
      resolveResult = resolve
    })
    this.writeTail = this.writeTail
      .catch(() => undefined)
      .then(async () => {
        resolveResult(await this.executeWrite(name, input, options))
      })
    await this.writeTail
    return result
  }

  async verify(
    name: string,
    input: unknown,
    output: unknown,
    options: ChartToolVerificationOptions,
  ): Promise<PostconditionResult> {
    if (options.signal?.aborted) {
      return { ok: false, error: postconditionError('Verification was cancelled.', true) }
    }
    const controller = this.getController()
    if (this.disposed || !controller) {
      return { ok: false, error: postconditionError('The chart target is gone.', true) }
    }
    let state
    let context
    try {
      state = controller.agent.getState()
      context = controller.agent.getContext()
    } catch {
      return { ok: false, error: postconditionError('Chart state is unavailable.', true) }
    }
    if (
      options.expectedChartRevision !== undefined &&
      state.chartRevision !== options.expectedChartRevision
    ) {
      return {
        ok: false,
        error: postconditionError('Chart revision changed before verification.', true, {
          expectedChartRevision: options.expectedChartRevision,
          currentChartRevision: state.chartRevision,
        }),
      }
    }

    const args = input as ValidatedToolArguments
    const data = output as ValidatedToolOutput
    let ok: boolean
    switch (name) {
      case 'chart.setTheme':
        ok = state.theme === args.theme
        break
      case 'chart.scrollToRight':
        ok = state.visibleRange?.to === context.dataRange.to
        break
      case 'chart.zoomToLevel':
        ok = state.zoomLevel === args.level
        break
      case 'data.setSymbols':
        ok =
          normalize(context.symbol ?? undefined) === normalize(args.symbol) &&
          (!args.market || normalize(context.market ?? undefined) === normalize(args.market)) &&
          (!args.exchange || normalize(context.exchange ?? undefined) === normalize(args.exchange))
        break
      case 'data.addComparisonSymbol':
        ok = state.comparisonSymbols.some((symbol) => normalize(symbol) === normalize(args.symbol))
        break
      case 'data.removeComparisonSymbol':
        ok = !state.comparisonSymbols.some((symbol) => normalize(symbol) === normalize(args.symbol))
        break
      case 'indicators.add':
        ok =
          typeof data.instanceId === 'string' &&
          state.activeIndicators.some((indicator) => indicator.instanceId === data.instanceId)
        break
      case 'indicators.remove':
        ok = !state.activeIndicators.some((indicator) => indicator.instanceId === args.instanceId)
        break
      case 'indicators.updateParams':
        ok = state.activeIndicators.some(
          (indicator) =>
            indicator.instanceId === args.instanceId &&
            Object.entries(args.params ?? {}).every(
              ([key, value]) => indicator.params[key] === value,
            ),
        )
        break
      case 'drawing.add':
        ok = typeof data.drawingId === 'string' && state.drawingIds.includes(data.drawingId)
        break
      case 'drawing.remove':
        ok = !state.drawingIds.includes(args.drawingId)
        break
      case 'drawing.clear':
        ok = state.drawingIds.length === 0
        break
      case 'drawing.setTool':
        ok = controller.drawingTool.peek() === this.mapDrawingTool(args.tool)
        break
      case 'markers.update':
        ok =
          JSON.stringify(publicMarkerIds(controller, options.identity.sessionId)) ===
          JSON.stringify(
            args.markers
              .map((marker) => marker.id)
              .reduce<string[]>((ordered, id) => {
                const index = ordered.findIndex((current) => id.localeCompare(current) < 0)
                ordered.splice(index < 0 ? ordered.length : index, 0, id)
                return ordered
              }, []),
          )
        break
      case 'markers.clear':
        ok = publicMarkerIds(controller, options.identity.sessionId).length === 0
        break
      case 'navigation.setVisibleRange':
        ok =
          state.visibleRange?.from === data.visibleRange?.from &&
          state.visibleRange?.to === data.visibleRange?.to
        break
      default:
        ok = !isWrite(name) || this.postconditions.get(toolKey(options.identity))?.name === name
    }
    return ok
      ? { ok: true }
      : {
          ok: false,
          error: postconditionError(`Live chart state did not confirm ${name}.`, true, {
            chartRevision: state.chartRevision,
          }),
        }
  }

  async undo(
    undoToken: string,
    expectedChartRevision: number,
    signal?: AbortSignal,
  ): Promise<ToolHostResult> {
    if (signal?.aborted) return abortFailure()
    const entry = this.undoEntries.get(undoToken)
    if (!entry) return failure('UNDO_CONFLICT', 'The undo token is unknown or expired.')
    if (entry.result) {
      return entry.result.ok
        ? { ...entry.result, meta: { ...entry.result.meta, idempotentReplay: true } }
        : entry.result
    }
    const controller = this.getController()
    if (this.disposed || !controller)
      return failure('TARGET_GONE', 'The chart target is gone.', true)
    const before = controller.agent.getContext()
    if (before.chartId !== entry.chartId || before.chartRevision !== expectedChartRevision) {
      return failure('UNDO_CONFLICT', 'The chart changed after this mutation.', false, {
        currentChartRevision: before.chartRevision,
        expectedChartRevision,
      })
    }
    try {
      this.applyUndoSnapshot(controller, entry.snapshot)
      const after = controller.agent.getContext()
      entry.result = {
        ok: true,
        data: {},
        meta: {
          chartRevisionBefore: before.chartRevision,
          chartRevisionAfter: after.chartRevision,
          dataRevision: after.dataRevision,
        },
      }
      return entry.result
    } catch {
      return failure('UNDO_CONFLICT', 'The prior chart state could not be restored.', true)
    }
  }

  dispose(): void {
    this.disposed = true
    this.undoEntries.clear()
    this.postconditions.clear()
  }

  private controller(): ChartController | ToolHostResult {
    const controller = this.getController()
    return controller ?? failure('TARGET_GONE', 'No ready chart controller is registered.', true)
  }

  private async executeRead(
    name: string,
    input: unknown,
    identity: ToolExecutionIdentity,
  ): Promise<ToolHostResult> {
    const resolved = this.controller()
    if ('ok' in resolved) return resolved
    try {
      const context = resolved.agent.getContext()
      const meta = {
        chartRevisionBefore: context.chartRevision,
        chartRevisionAfter: context.chartRevision,
        dataRevision: context.dataRevision,
      }
      switch (name) {
        case 'agent.capabilities':
          return {
            ok: true,
            data: {
              registryVersion: CANONICAL_TOOL_REGISTRY.version,
              tools: CANONICAL_TOOL_REGISTRY.list().map((definition) => {
                const capability = definition.capability(this.capabilityContext())
                return Object.assign(
                  {
                    name: definition.name,
                    version: definition.version,
                    available: capability.available,
                  },
                  capability.reasonCode ? { reasonCode: capability.reasonCode } : {},
                  capability.reason ? { reason: capability.reason } : {},
                )
              }),
            },
            meta,
          }
        case 'chart.getContext':
          return {
            ok: true,
            data: {
              ...(context.chartId ? { chartId: context.chartId } : {}),
              ...(context.symbol ? { symbol: context.symbol } : {}),
              ...(context.market ? { market: context.market } : {}),
              ...(context.exchange ? { exchange: context.exchange } : {}),
              ...(context.period ? { period: context.period } : {}),
              theme: resolved.theme.peek(),
              ...(context.visibleRange ? { visibleRange: context.visibleRange } : {}),
              chartRevision: context.chartRevision,
              dataRevision: context.dataRevision,
            },
            meta,
          }
        case 'chart.getState': {
          const state = resolved.agent.getState()
          return {
            ok: true,
            data: {
              chartRevision: state.chartRevision,
              dataRevision: state.dataRevision,
              theme: state.theme,
              zoomLevel: state.zoomLevel,
              ...(state.visibleRange ? { visibleRange: state.visibleRange } : {}),
              activeIndicators: state.activeIndicators,
              comparisonSymbols: state.comparisonSymbols,
              drawingIds: state.drawingIds,
              markerIds: publicMarkerIds(resolved, identity.sessionId),
            },
            meta,
          }
        }
        case 'indicators.listActive':
          return {
            ok: true,
            data: { indicators: context.activeIndicators },
            meta,
          }
        case 'indicators.query': {
          const content = await resolved.agent.queryIndicator(input as never)
          return { ok: true, data: { content }, content, meta }
        }
        default:
          return failure('TOOL_UNAVAILABLE', 'The requested read handler is unavailable.')
      }
    } catch (cause) {
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? String((cause as { code: unknown }).code)
          : 'TOOL_EXECUTION_FAILED'
      return failure(
        code,
        'The chart read could not be completed.',
        code === 'DATA_REVISION_CHANGED',
      )
    }
  }

  private async executeWrite(
    name: string,
    input: unknown,
    options: ChartToolExecutionOptions,
  ): Promise<ToolHostResult> {
    if (options.signal?.aborted) return abortFailure()
    const resolved = this.controller()
    if ('ok' in resolved) return resolved
    let before
    try {
      before = resolved.agent.getContext()
    } catch {
      return failure('TOOL_UNAVAILABLE', 'The chart is not ready for mutation.', true)
    }
    if (
      options.expectedChartRevision === undefined ||
      before.chartRevision !== options.expectedChartRevision
    ) {
      return stateConflict(before.chartRevision)
    }

    const args = input as ValidatedToolArguments
    const snapshot = this.captureUndoSnapshot(resolved, name)
    let data: Record<string, unknown> = {}
    try {
      switch (name) {
        case 'chart.scrollToRight':
          resolved.scrollToRight()
          break
        case 'chart.setTheme':
          resolved.setTheme(args.theme)
          break
        case 'chart.zoomIn':
          resolved.zoomIn(args.anchorX)
          break
        case 'chart.zoomOut':
          resolved.zoomOut(args.anchorX)
          break
        case 'chart.zoomToLevel':
          resolved.zoomToLevel(args.level, args.anchorX)
          break
        case 'data.setSymbols': {
          const instrument = resolveInstrument(resolved, args as { symbol: string })
          if (!instrument.ok) return instrument.result
          const primary = {
            ...instrument.spec,
            ...(args.period ? { period: args.period } : {}),
            ...(args.adjust ? { adjust: args.adjust } : {}),
            ...(args.source ? { source: args.source } : {}),
            ...(args.startDate ? { startDate: args.startDate } : {}),
            ...(args.endDate ? { endDate: args.endDate } : {}),
          }
          resolved.setSymbols([primary, ...resolved.symbols.peek().slice(1)])
          break
        }
        case 'data.addComparisonSymbol': {
          const instrument = resolveInstrument(resolved, args as { symbol: string })
          if (!instrument.ok) return instrument.result
          resolved.addComparisonSymbol(instrument.spec)
          break
        }
        case 'data.removeComparisonSymbol': {
          const instrument = resolveInstrument(
            resolved,
            args as { symbol: string },
            resolved.symbols.peek().slice(1),
          )
          if (!instrument.ok) return instrument.result
          const key = stableSpecKey(instrument.spec)
          resolved.setSymbols(resolved.symbols.peek().filter((spec) => stableSpecKey(spec) !== key))
          break
        }
        case 'indicators.add': {
          const definition = resolved.catalog.find(
            (item) => normalize(item.id) === normalize(args.definitionId),
          )
          if (!definition) return failure('INDICATOR_NOT_FOUND', 'Indicator is not registered.')
          const instanceId = resolved.addIndicator(definition.id, definition.role)
          data = { instanceId }
          break
        }
        case 'indicators.remove':
          if (!resolved.removeIndicator(args.instanceId)) {
            return failure('INDICATOR_NOT_FOUND', 'Indicator instance is not active.')
          }
          break
        case 'indicators.updateParams':
          if (!resolved.updateIndicatorParams(args.instanceId, args.params)) {
            return failure('INDICATOR_NOT_FOUND', 'Indicator instance is not active.')
          }
          break
        case 'drawing.add': {
          const drawingId = this.id()
          const drawing: DrawingObject = {
            id: drawingId,
            kind: args.kind,
            paneId: 'main',
            visible: true,
            anchors: args.anchors.map((anchor) => {
              const time = resolved.getTimestampAtLogicalIndex(anchor.barIndex)
              return {
                id: this.id(),
                index: anchor.barIndex,
                ...(time === null ? {} : { time }),
                price: anchor.price,
              }
            }),
            params: {},
            style: args.style ?? {},
          }
          resolved.setDrawings([...resolved.getFullDrawings(), drawing])
          data = { drawingId }
          break
        }
        case 'drawing.clear':
          resolved.clearDrawings()
          break
        case 'drawing.remove':
          if (!resolved.drawings.peek().some((drawing) => drawing.id === args.drawingId)) {
            return failure('DRAWING_NOT_FOUND', 'Drawing is not present on the chart.')
          }
          resolved.removeDrawing(args.drawingId)
          break
        case 'drawing.setTool':
          resolved.setDrawingToolId(this.mapDrawingTool(args.tool))
          break
        case 'markers.update':
          this.replaceSessionMarkers(resolved, options.identity.sessionId, args.markers)
          break
        case 'markers.clear':
          this.replaceSessionMarkers(resolved, options.identity.sessionId, [])
          break
        case 'navigation.setVisibleRange': {
          const result = resolved.agent.setVisibleRange({ from: args.from, to: args.to })
          data = {
            visibleRange: result.visibleRange,
            clampedFrom: result.clampedFrom,
            clampedTo: result.clampedTo,
          }
          break
        }
        default:
          return failure('TOOL_UNAVAILABLE', 'The requested write handler is unavailable.')
      }
    } catch (cause) {
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? String((cause as { code: unknown }).code)
          : 'TOOL_EXECUTION_FAILED'
      return failure(code, 'The chart mutation could not be completed.', true)
    }

    const after = resolved.agent.getContext()
    const token = this.id()
    this.undoEntries.set(token, {
      token,
      snapshot,
      chartId: before.chartId,
      revisionAfter: after.chartRevision,
    })
    while (this.undoEntries.size > this.maxUndoEntries) {
      const oldest = this.undoEntries.keys().next().value as string | undefined
      if (!oldest) break
      this.undoEntries.delete(oldest)
    }
    this.postconditions.set(toolKey(options.identity), { name, revisionAfter: after.chartRevision })
    return {
      ok: true,
      data,
      meta: {
        chartRevisionBefore: before.chartRevision,
        chartRevisionAfter: after.chartRevision,
        dataRevision: after.dataRevision,
        undoToken: token,
      },
    }
  }

  private captureUndoSnapshot(controller: ChartController, name: string): UndoSnapshot {
    if (name === 'chart.setTheme') return { kind: 'theme', theme: controller.theme.peek() }
    if (
      name === 'chart.scrollToRight' ||
      name === 'chart.zoomIn' ||
      name === 'chart.zoomOut' ||
      name === 'chart.zoomToLevel' ||
      name === 'navigation.setVisibleRange'
    ) {
      const state = controller.agent.getState()
      return { kind: 'viewport', zoomLevel: state.zoomLevel, range: state.visibleRange }
    }
    if (name.startsWith('data.')) {
      return { kind: 'symbols', symbols: clone(controller.symbols.peek()) }
    }
    if (name.startsWith('indicators.')) {
      return { kind: 'indicators', indicators: clone(controller.indicators.peek()) }
    }
    if (name === 'drawing.setTool') {
      return { kind: 'drawing-tool', tool: controller.drawingTool.peek() }
    }
    if (name.startsWith('drawing.')) {
      return { kind: 'drawings', drawings: clone(controller.getFullDrawings()) }
    }
    return { kind: 'markers', markers: clone([...controller.customMarkers.peek().values()]) }
  }

  private applyUndoSnapshot(controller: ChartController, snapshot: UndoSnapshot): void {
    switch (snapshot.kind) {
      case 'theme':
        controller.setTheme(snapshot.theme)
        return
      case 'viewport':
        controller.zoomToLevel(snapshot.zoomLevel)
        if (snapshot.range) controller.agent.setVisibleRange(snapshot.range)
        return
      case 'symbols':
        controller.setSymbols(snapshot.symbols)
        return
      case 'indicators':
        for (const indicator of controller.indicators.peek()) {
          controller.removeIndicator(indicator.id)
        }
        for (const indicator of snapshot.indicators) {
          controller.addIndicator(indicator.definitionId, indicator.role, indicator.params)
        }
        return
      case 'drawings':
        controller.setDrawings([...clone(snapshot.drawings)])
        return
      case 'drawing-tool':
        controller.setDrawingToolId(snapshot.tool)
        return
      case 'markers':
        controller.updateCustomMarkers(clone(snapshot.markers))
    }
  }

  private mapDrawingTool(tool: unknown): DrawingTool {
    if (tool === null) return 'cursor'
    return tool as DrawingTool
  }

  private replaceSessionMarkers(
    controller: ChartController,
    sessionId: string,
    rawMarkers: ReadonlyArray<MarkerInput>,
  ): void {
    const next = [...controller.customMarkers.peek().values()].filter(
      (marker) => marker.metadata?.agentSessionId !== sessionId,
    )
    for (const marker of rawMarkers) {
      const timestamp = Date.parse(marker.date)
      if (!Number.isFinite(timestamp)) {
        throw Object.assign(new Error('Invalid marker date'), { code: 'INVALID_ARGUMENTS' })
      }
      next.push({
        id: sessionMarkerId(sessionId, marker.id),
        date: marker.date,
        timestamp,
        shape: marker.shape,
        groupKey: marker.groupKey,
        style: marker.style,
        label: marker.label,
        metadata: { agentSessionId: sessionId, agentMarkerId: marker.id },
      })
    }
    controller.updateCustomMarkers(next)
  }
}

export function createChartToolHost(options: ChartToolHostOptions): ChartToolHost {
  return new ChartToolHost(options)
}
