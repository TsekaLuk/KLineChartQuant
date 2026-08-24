import {
  CANONICAL_TOOL_REGISTRY,
  type CanonicalToolResult,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolHostResult,
  type ToolPolicyEvaluator,
  type ToolReplayResolver,
} from '@363045841yyt/klinechart-ai-runtime/browser'

import { AgentRuntimeError } from '../contracts/errors.js'
import { createPiTools } from '../pi/pi-tool-adapter.js'

import type {
  AgentRunUiEventInput,
  ConfirmationView,
  ToolConfirmationDecision,
} from '../contracts/ui.js'
import type { PiRunPlan } from '../pi/types.js'
import type { RendererToolProxy } from '../renderer/renderer-tool-proxy.js'
import type { RuntimeSessionService } from '../sessions/runtime-session-service.js'
import type { KqToolTraceEntry, RunPersistenceContext } from '../sessions/types.js'

export interface AgentToolRuntimeOptions {
  readonly proxy: RendererToolProxy
  readonly sessions: RuntimeSessionService
  readonly now?: () => number
  readonly id?: () => string
  readonly confirmationTimeoutMs?: number
  readonly maxTraceEntries?: number
}

export interface AgentToolRunHooks {
  emit(event: AgentRunUiEventInput): Promise<void> | void
}

interface UndoMutation {
  readonly identity: ToolExecutionContext['identity']
  readonly toolCallId: string
  readonly undoToken: string
  readonly revisionAfter: number
}

interface RunState {
  readonly context: RunPersistenceContext
  readonly hooks: AgentToolRunHooks
  observedRevision?: number
  readonly afterByCall: Map<string, number>
  readonly undo: UndoMutation[]
  undoExpectedRevision?: number
  undoCompleted: boolean
}

interface PendingConfirmation {
  readonly id: string
  readonly runId: string
  readonly sessionId: string
  readonly toolName: string
  readonly scopeKey: string
  readonly timer: ReturnType<typeof setTimeout>
  readonly resolve: (decision: ToolConfirmationDecision | 'expired' | 'cancelled') => void
}

interface InFlightToolCall {
  readonly inputHash: string
  readonly result: Promise<CanonicalToolResult>
  readonly resolve: (result: CanonicalToolResult) => void
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
  const ordered: Array<[string, unknown]> = []
  for (const entry of entries) {
    const index = ordered.findIndex(([key]) => entry[0].localeCompare(key) < 0)
    ordered.splice(index < 0 ? ordered.length : index, 0, entry)
  }
  return `{${ordered.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function traceKey(context: ToolExecutionContext): string {
  const { identity, definition } = context
  return `${identity.sessionId}/${identity.runId}/${identity.toolCallId}/${definition.version}`
}

function canonicalInputHash(definition: ToolDefinition, input: unknown): Promise<string> {
  return sha256(stableJson({ name: definition.name, input }))
}

function scopeKey(definition: ToolDefinition, input: unknown): string {
  const explicitScope =
    typeof input === 'object' && input !== null && 'scope' in input
      ? (input as { scope?: unknown }).scope
      : undefined
  return `${definition.name}:${stableJson(explicitScope ?? {})}`
}

function isWrite(definition: ToolDefinition): boolean {
  return definition.policy.safety !== 'read-only'
}

export class AgentToolRuntime {
  private readonly proxy: RendererToolProxy
  private readonly sessions: RuntimeSessionService
  private readonly now: () => number
  private readonly id: () => string
  private readonly confirmationTimeoutMs: number
  private readonly maxTraceEntries: number
  private readonly runs = new Map<string, RunState>()
  private readonly traces = new Map<string, Map<string, KqToolTraceEntry>>()
  private readonly inFlight = new Map<string, InFlightToolCall>()
  private readonly pending = new Map<string, PendingConfirmation>()
  private readonly sessionGrants = new Set<string>()

  constructor(options: AgentToolRuntimeOptions) {
    this.proxy = options.proxy
    this.sessions = options.sessions
    this.now = options.now ?? Date.now
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? 30_000
    this.maxTraceEntries = options.maxTraceEntries ?? 1_000
  }

  async composePlan(
    context: RunPersistenceContext,
    plan: PiRunPlan,
    hooks: AgentToolRunHooks,
  ): Promise<PiRunPlan> {
    const capabilities = await this.proxy.capabilities()
    const state: RunState = {
      context,
      hooks,
      observedRevision: capabilities?.chartRevision,
      afterByCall: new Map(),
      undo: [],
      undoCompleted: false,
    }
    this.runs.set(context.runId, state)
    await this.ensureTraces(context.sessionId)

    const supportedTools = new Set(
      [...(capabilities?.supportedTools ?? [])].filter((name) => {
        const definition = this.definition(name)
        return definition && (!context.readOnly || !isWrite(definition))
      }),
    )
    const capabilityContext = {
      chartReady: Boolean(capabilities),
      supportedTools,
    }
    const tools = createPiTools({
      capabilityContext,
      identity: {
        sessionId: context.sessionId,
        runId: context.runId,
        turnId: context.turnId,
      },
      execute: (name, input, executionContext, signal) =>
        this.execute(state, name, input, executionContext, signal),
      verify: (name, input, output, executionContext, signal) =>
        this.proxy.verify(
          name,
          input,
          output,
          executionContext,
          signal,
          state.afterByCall.get(executionContext.identity.toolCallId),
        ),
      policy: this.policy(state),
      replay: this.replay(context.sessionId),
      record: (definition, input, result) => this.record(state, definition, input, result),
    })

    return {
      ...plan,
      scope: { ...plan.scope, readOnly: context.readOnly },
      tools,
      systemPrompt:
        tools.length > 0
          ? `You are the KLineChartQuant financial analysis Agent. Inspect chart state before writes, use only supplied tools, preserve structured failures, and never claim a mutation succeeded unless its tool result succeeded. Scope: ${JSON.stringify(plan.scope)}.`
          : 'You are the KLineChartQuant financial analysis Agent. No ready chart target is available. Answer only from user-provided text and do not claim to have read or changed the chart.',
    }
  }

  async confirm(confirmationId: string, decision: ToolConfirmationDecision): Promise<void> {
    const pending = this.pending.get(confirmationId)
    if (!pending) {
      throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No matching tool confirmation is pending.')
    }
    clearTimeout(pending.timer)
    this.pending.delete(confirmationId)
    if (decision === 'allow-session') {
      this.sessionGrants.add(`${pending.sessionId}/${pending.scopeKey}`)
    }
    pending.resolve(decision)
    await this.runs.get(pending.runId)?.hooks.emit({
      type: 'tool.confirmation.resolved',
      confirmationId,
      decision,
    })
  }

  finishRun(runId: string): void {
    for (const confirmation of this.pending.values()) {
      if (confirmation.runId !== runId) continue
      clearTimeout(confirmation.timer)
      this.pending.delete(confirmation.id)
      confirmation.resolve('cancelled')
    }
  }

  async undoTurn(runId: string): Promise<readonly string[]> {
    const state = this.runs.get(runId)
    if (!state) {
      throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No reversible tool result is available.')
    }
    if (state.undoCompleted) return []
    if (state.undo.length === 0) {
      throw new AgentRuntimeError('RUN_NOT_ACTIVE', 'No reversible tool result is available.')
    }
    const capabilities = await this.proxy.capabilities()
    const expectedStart = state.undoExpectedRevision ?? state.undo.at(-1)?.revisionAfter
    if (
      !capabilities ||
      expectedStart === undefined ||
      capabilities.chartRevision !== expectedStart
    ) {
      throw new AgentRuntimeError('UNDO_CONFLICT', 'The chart changed after this Agent turn.')
    }

    let expectedRevision = capabilities.chartRevision
    const undone: string[] = []
    const undoNext = async (): Promise<void> => {
      const mutation = state.undo.at(-1)
      if (!mutation) return
      const result = await this.proxy.undo(mutation.identity, mutation.undoToken, expectedRevision)
      if (!result.ok) {
        state.undoExpectedRevision = expectedRevision
        throw new AgentRuntimeError('UNDO_CONFLICT', 'The Agent turn was only partially undone.', {
          retryable: result.error.retryable,
        })
      }
      expectedRevision = result.meta?.chartRevisionAfter ?? expectedRevision
      state.undo.pop()
      state.undoExpectedRevision = expectedRevision
      undone.push(mutation.toolCallId)
      await state.hooks.emit({
        type: 'tool.undone',
        toolCallId: mutation.toolCallId,
        undoneAt: this.now(),
      })
      await undoNext()
    }
    await undoNext()
    state.undoCompleted = true
    state.observedRevision = expectedRevision
    return undone
  }

  async close(): Promise<void> {
    for (const confirmation of this.pending.values()) {
      clearTimeout(confirmation.timer)
      confirmation.resolve('cancelled')
    }
    this.pending.clear()
    this.runs.clear()
    this.inFlight.clear()
    this.sessionGrants.clear()
    await this.proxy.close()
  }

  private definition(name: string): ToolDefinition | undefined {
    return CANONICAL_TOOL_REGISTRY.find(name)
  }

  private async execute(
    state: RunState,
    name: string,
    input: unknown,
    context: ToolExecutionContext,
    signal: AbortSignal,
  ): Promise<ToolHostResult> {
    const expected = isWrite(context.definition) ? state.observedRevision : undefined
    const result = await this.proxy.execute(name, input, context, signal, expected)
    const after = result.meta?.chartRevisionAfter
    if (after !== undefined) {
      state.observedRevision = after
      state.afterByCall.set(context.identity.toolCallId, after)
    }
    return result
  }

  private policy(state: RunState): ToolPolicyEvaluator {
    return async (definition, input, executionContext) => {
      if (state.context.readOnly && isWrite(definition)) {
        return {
          allowed: false,
          error: {
            code: 'POLICY_DENIED',
            message: 'This Agent run is read-only.',
            retryable: false,
          },
        }
      }
      const scope = scopeKey(definition, input)
      const grantKey = `${state.context.sessionId}/${scope}`
      const requiresConfirmation =
        definition.policy.confirmation === 'always' ||
        definition.policy.safety === 'external-side-effect'
      if (!requiresConfirmation || this.sessionGrants.has(grantKey)) return { allowed: true }

      const decision = await this.waitForConfirmation(state, definition, executionContext, scope)
      if (decision === 'confirmed' || decision === 'allow-session') return { allowed: true }
      return {
        allowed: false,
        error: {
          code:
            decision === 'expired'
              ? 'CONFIRMATION_EXPIRED'
              : decision === 'cancelled'
                ? 'CANCELLED'
                : 'POLICY_DENIED',
          message:
            decision === 'expired'
              ? 'The tool confirmation expired.'
              : decision === 'cancelled'
                ? 'The run ended before confirmation.'
                : 'The user rejected this tool call.',
          retryable: decision === 'expired',
        },
      }
    }
  }

  private waitForConfirmation(
    state: RunState,
    definition: ToolDefinition,
    executionContext: ToolExecutionContext,
    normalizedScope: string,
  ): Promise<ToolConfirmationDecision | 'expired' | 'cancelled'> {
    const confirmationId = this.id()
    const expiresAt = this.now() + this.confirmationTimeoutMs
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(confirmationId)
        resolve('expired')
        void state.hooks.emit({
          type: 'tool.confirmation.resolved',
          confirmationId,
          decision: 'expired',
        })
      }, this.confirmationTimeoutMs)
      this.pending.set(confirmationId, {
        id: confirmationId,
        runId: state.context.runId,
        sessionId: state.context.sessionId,
        toolName: definition.name,
        scopeKey: normalizedScope,
        timer,
        resolve,
      })
      const request: ConfirmationView = {
        id: confirmationId,
        toolCallId: executionContext.identity.toolCallId,
        title: definition.title,
        description: definition.description,
        impact: `Execute ${definition.name} on the active chart.`,
        reversible: definition.policy.reversible,
        expiresAt,
        status: 'pending',
      }
      void state.hooks.emit({ type: 'tool.confirmation.required', request })
    })
  }

  private replay(sessionId: string): ToolReplayResolver {
    return async (definition, input, context) => {
      const record = this.traces.get(sessionId)?.get(traceKey(context))
      const inputHash = await canonicalInputHash(definition, input)
      if (record) {
        if (inputHash !== record.inputHash) {
          return {
            error: {
              code: 'DUPLICATE_REQUEST',
              message: 'This tool-call identity was reused with different input.',
              retryable: false,
            },
          }
        }
        return {
          replay: {
            ...structuredClone(record.result),
            meta: { ...record.result.meta, idempotentReplay: true },
          },
        }
      }

      const key = traceKey(context)
      const active = this.inFlight.get(key)
      if (active) {
        if (inputHash !== active.inputHash) {
          return {
            error: {
              code: 'DUPLICATE_REQUEST',
              message: 'This tool-call identity was reused with different input.',
              retryable: false,
            },
          }
        }
        const result = await active.result
        return {
          replay: {
            ...structuredClone(result),
            meta: { ...result.meta, idempotentReplay: true },
          },
        }
      }

      let resolve!: (result: CanonicalToolResult) => void
      const result = new Promise<CanonicalToolResult>((complete) => {
        resolve = complete
      })
      this.inFlight.set(key, { inputHash, result, resolve })
      return undefined
    }
  }

  private async record(
    state: RunState,
    definition: ToolDefinition,
    input: unknown,
    result: CanonicalToolResult,
  ): Promise<void> {
    const key = `${state.context.sessionId}/${state.context.runId}/${result.meta.toolCallId}/${definition.version}`
    const sessionTraces = this.traces.get(state.context.sessionId) ?? new Map()
    this.traces.set(state.context.sessionId, sessionTraces)
    if (sessionTraces.has(key)) return
    const trace: Omit<KqToolTraceEntry, 'schemaVersion'> = {
      key,
      inputHash: await canonicalInputHash(definition, input),
      toolName: definition.name,
      toolVersion: definition.version,
      result: structuredClone(result),
      target: this.proxy.target,
      createdAt: this.now(),
    }
    try {
      const persisted = await this.sessions.appendToolTrace(state.context, trace)
      sessionTraces.set(key, persisted)
    } finally {
      this.inFlight.get(key)?.resolve(result)
      this.inFlight.delete(key)
    }
    while (sessionTraces.size > this.maxTraceEntries) {
      const oldest = sessionTraces.keys().next().value as string | undefined
      if (!oldest) break
      sessionTraces.delete(oldest)
    }
    if (result.meta.undoToken && definition.policy.reversible) {
      state.undo.push({
        identity: {
          requestId: result.meta.requestId,
          sessionId: result.meta.sessionId,
          runId: result.meta.runId,
          turnId: result.meta.turnId,
          toolCallId: result.meta.toolCallId,
        },
        toolCallId: result.meta.toolCallId,
        undoToken: result.meta.undoToken,
        revisionAfter: result.meta.chartRevisionAfter ?? state.observedRevision ?? 0,
      })
    }
  }

  private async ensureTraces(sessionId: string): Promise<void> {
    if (this.traces.has(sessionId)) return
    const entries = await this.sessions.listToolTraces(sessionId, this.maxTraceEntries)
    this.traces.set(sessionId, new Map(entries.map((entry) => [entry.key, entry])))
  }
}
