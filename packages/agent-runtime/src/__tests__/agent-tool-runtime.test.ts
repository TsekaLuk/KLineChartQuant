import {
  RENDERER_TOOL_PROTOCOL_VERSION,
  type RendererToolMessage,
  type RendererToolTarget,
} from '@363045841yyt/klinechart-ai-runtime/browser'
import { InMemorySessionRepo } from '@earendil-works/pi-agent-core'
import { describe, expect, it, vi } from 'vitest'

import { CanonicalPiToolError } from '../pi/pi-tool-adapter'
import { RendererToolProxy, type RendererToolTransport } from '../renderer/renderer-tool-proxy'
import { RuntimeSessionService } from '../sessions/runtime-session-service'
import { AgentToolRuntime, type AgentToolRunHooks } from '../tools/agent-tool-runtime'

import type { AgentRunUiEventInput } from '../contracts/ui'
import type { PiRunPlan, RuntimeToolDefinition } from '../pi/types'
import type { RunPersistenceContext } from '../sessions/types'

const target: RendererToolTarget = {
  windowId: 'window-1',
  chartId: 'primary',
  hostGeneration: 1,
}

class FixtureTransport implements RendererToolTransport {
  readonly target = target
  readonly executeCalls: Array<{ name: string; input: unknown; token: string }> = []
  readonly undoCalls: string[] = []
  revision = 7
  failUndoTokenOnce?: string

  async request(message: RendererToolMessage): Promise<unknown> {
    const envelope = {
      protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
      requestId: message.requestId,
      target,
    }
    if (message.kind === 'host.capabilities') {
      return {
        ...envelope,
        kind: 'host.capabilities.result',
        chartRevision: this.revision,
        supportedTools: [
          'chart.getContext',
          'chart.scrollToRight',
          'chart.setTheme',
          'chart.zoomIn',
          'drawing.clear',
        ],
      }
    }
    if (message.kind === 'tool.execute') {
      const before = this.revision
      const write = message.toolName !== 'chart.getContext'
      if (write) this.revision += 1
      const token = `undo:${message.identity.toolCallId}`
      this.executeCalls.push({ name: message.toolName, input: message.input, token })
      return {
        ...envelope,
        kind: 'tool.execute.result',
        result:
          message.toolName === 'chart.getContext'
            ? {
                ok: true,
                data: { chartRevision: this.revision, dataRevision: 1 },
                meta: {
                  chartRevisionBefore: this.revision,
                  chartRevisionAfter: this.revision,
                  dataRevision: 1,
                },
              }
            : {
                ok: true,
                data: {},
                meta: {
                  chartRevisionBefore: before,
                  chartRevisionAfter: this.revision,
                  dataRevision: 1,
                  undoToken: token,
                },
              },
      }
    }
    if (message.kind === 'tool.verify') {
      return { ...envelope, kind: 'tool.verify.result', result: { ok: true } }
    }
    if (message.kind === 'tool.undo') {
      this.undoCalls.push(message.undoToken)
      if (this.failUndoTokenOnce === message.undoToken) {
        this.failUndoTokenOnce = undefined
        return {
          ...envelope,
          kind: 'tool.undo.result',
          result: {
            ok: false,
            error: { code: 'UNDO_CONFLICT', message: 'fixture conflict', retryable: true },
          },
        }
      }
      const before = this.revision
      this.revision += 1
      return {
        ...envelope,
        kind: 'tool.undo.result',
        result: {
          ok: true,
          data: {},
          meta: { chartRevisionBefore: before, chartRevisionAfter: this.revision },
        },
      }
    }
    return {
      ...envelope,
      kind: 'tool.error',
      error: { code: 'CANCELLED', message: 'cancelled', retryable: true },
    }
  }
}

function emptyPlan(context: RunPersistenceContext): PiRunPlan {
  return {
    sessionId: context.sessionId,
    runId: context.runId,
    turnId: context.turnId,
    prompt: context.prompt,
    readOnly: context.readOnly,
    scope: { symbol: null, period: null, readOnly: context.readOnly },
    tools: [],
  } as unknown as PiRunPlan
}

async function invoke(tool: RuntimeToolDefinition, input: unknown, toolCallId: string) {
  return tool.execute(input, {
    runId: 'run-1',
    toolCallId,
    signal: new AbortController().signal,
    progress: () => undefined,
  })
}

async function canonicalFailure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof CanonicalPiToolError) return error.result
    throw error
  }
  throw new Error('Expected the canonical tool call to fail.')
}

async function sessionFixture(readOnly = false) {
  let id = 0
  const sessions = new RuntimeSessionService({
    repository: new InMemorySessionRepo(),
    id: () => `id-${++id}`,
  })
  const session = await sessions.create()
  const context = await sessions.beginRun({
    sessionId: session.id,
    runId: 'run-1',
    turnId: 'turn-1',
    prompt: 'fixture',
    readOnly,
    startedAt: 1,
  })
  return { sessions, context }
}

function createRuntime(
  sessions: RuntimeSessionService,
  transport: FixtureTransport,
  options: { confirmationTimeoutMs?: number } = {},
) {
  const proxy = new RendererToolProxy()
  proxy.attach(transport)
  return new AgentToolRuntime({ proxy, sessions, ...options })
}

function latestConfirmationId(events: readonly AgentRunUiEventInput[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'tool.confirmation.required') return event.request.id
  }
  return undefined
}

describe('AgentToolRuntime', () => {
  it('projects only active-scope capabilities and excludes writes in read-only runs', async () => {
    const { sessions, context } = await sessionFixture(true)
    const runtime = createRuntime(sessions, new FixtureTransport())
    const plan = await runtime.composePlan(context, emptyPlan(context), {
      emit: vi.fn<AgentToolRunHooks['emit']>(),
    })

    expect(plan.tools.map((tool) => tool.name)).toEqual(['chart.getContext'])
  })

  it('persists exact idempotency across runtime reconstruction and rejects conflicting reuse', async () => {
    const { sessions, context } = await sessionFixture()
    const transport = new FixtureTransport()
    const firstRuntime = createRuntime(sessions, transport)
    const firstPlan = await firstRuntime.composePlan(context, emptyPlan(context), {
      emit: vi.fn<AgentToolRunHooks['emit']>(),
    })
    const setTheme = firstPlan.tools.find((tool) => tool.name === 'chart.setTheme')!
    await invoke(setTheme, { theme: 'dark' }, 'call-1')
    expect(transport.executeCalls).toHaveLength(1)

    const reconstructed = createRuntime(sessions, transport)
    const replayPlan = await reconstructed.composePlan(context, emptyPlan(context), {
      emit: vi.fn<AgentToolRunHooks['emit']>(),
    })
    const replay = await invoke(
      replayPlan.tools.find((tool) => tool.name === 'chart.setTheme')!,
      { theme: 'dark' },
      'call-1',
    )
    expect(replay.canonicalResult?.meta.idempotentReplay).toBe(true)
    expect(transport.executeCalls).toHaveLength(1)

    const changedInput = await canonicalFailure(
      invoke(
        replayPlan.tools.find((tool) => tool.name === 'chart.setTheme')!,
        { theme: 'light' },
        'call-1',
      ),
    )
    expect(changedInput).toMatchObject({ ok: false, error: { code: 'DUPLICATE_REQUEST' } })
  })

  it('includes the canonical tool name in duplicate detection', async () => {
    const { sessions, context } = await sessionFixture()
    const transport = new FixtureTransport()
    const runtime = createRuntime(sessions, transport)
    const plan = await runtime.composePlan(context, emptyPlan(context), {
      emit: vi.fn<AgentToolRunHooks['emit']>(),
    })
    await invoke(
      plan.tools.find((tool) => tool.name === 'chart.zoomIn')!,
      {},
      'shared-call',
    )
    const failure = await canonicalFailure(
      invoke(
        plan.tools.find((tool) => tool.name === 'chart.scrollToRight')!,
        {},
        'shared-call',
      ),
    )

    expect(failure).toMatchObject({ ok: false, error: { code: 'DUPLICATE_REQUEST' } })
    expect(transport.executeCalls).toHaveLength(1)
  })

  it('coalesces concurrent duplicate delivery before policy and Renderer dispatch', async () => {
    const { sessions, context } = await sessionFixture()
    const transport = new FixtureTransport()
    const runtime = createRuntime(sessions, transport)
    const plan = await runtime.composePlan(context, emptyPlan(context), {
      emit: vi.fn<AgentToolRunHooks['emit']>(),
    })
    const tool = plan.tools.find((candidate) => candidate.name === 'chart.setTheme')!

    const [first, replay] = await Promise.all([
      invoke(tool, { theme: 'dark' }, 'concurrent-call'),
      invoke(tool, { theme: 'dark' }, 'concurrent-call'),
    ])

    expect(transport.executeCalls).toHaveLength(1)
    expect(
      [first, replay].filter((result) => result.canonicalResult?.meta.idempotentReplay),
    ).toHaveLength(1)
  })

  it('keeps rejection, expiry, and session grants outside Renderer until authorized', async () => {
    const { sessions, context } = await sessionFixture()
    const transport = new FixtureTransport()
    const events: AgentRunUiEventInput[] = []
    const runtime = createRuntime(sessions, transport)
    const plan = await runtime.composePlan(context, emptyPlan(context), {
      emit: (event) => {
        events.push(event)
      },
    })
    const clear = plan.tools.find((tool) => tool.name === 'drawing.clear')!

    const rejected = canonicalFailure(invoke(clear, {}, 'clear-rejected'))
    await vi.waitFor(() => expect(events.at(-1)?.type).toBe('tool.confirmation.required'))
    const rejectedId = latestConfirmationId(events)
    await runtime.confirm(rejectedId!, 'rejected')
    expect(await rejected).toMatchObject({ ok: false, error: { code: 'POLICY_DENIED' } })
    expect(transport.executeCalls).toHaveLength(0)

    const allowed = invoke(clear, {}, 'clear-allowed')
    await vi.waitFor(() =>
      expect(events.filter((event) => event.type === 'tool.confirmation.required')).toHaveLength(2),
    )
    const allowedId = latestConfirmationId(events)
    await runtime.confirm(allowedId!, 'allow-session')
    await allowed
    await invoke(clear, {}, 'clear-granted')
    expect(transport.executeCalls).toHaveLength(2)

    const expiringEvents: AgentRunUiEventInput[] = []
    const expiring = createRuntime(sessions, transport, { confirmationTimeoutMs: 1 })
    const secondSession = await sessions.create()
    const secondContext = await sessions.beginRun({
      sessionId: secondSession.id,
      runId: 'run-2',
      turnId: 'turn-2',
      prompt: 'fixture',
      readOnly: false,
      startedAt: 2,
    })
    const expiringPlan = await expiring.composePlan(secondContext, emptyPlan(secondContext), {
      emit: (event) => {
        expiringEvents.push(event)
      },
    })
    const expired = await canonicalFailure(
      invoke(
        expiringPlan.tools.find((tool) => tool.name === 'drawing.clear')!,
        {},
        'clear-expired',
      ),
    )
    expect(expired).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_EXPIRED' } })
    expect(expiringEvents).toContainEqual(
      expect.objectContaining({ type: 'tool.confirmation.resolved', decision: 'expired' }),
    )
    expect(transport.executeCalls).toHaveLength(2)
  })

  it('undoes in reverse order and resumes remaining work after a partial conflict', async () => {
    const { sessions, context } = await sessionFixture()
    const transport = new FixtureTransport()
    const events: AgentRunUiEventInput[] = []
    const runtime = createRuntime(sessions, transport)
    const plan = await runtime.composePlan(context, emptyPlan(context), {
      emit: (event) => {
        events.push(event)
      },
    })
    await invoke(
      plan.tools.find((tool) => tool.name === 'chart.setTheme')!,
      { theme: 'dark' },
      'theme-call',
    )
    await invoke(
      plan.tools.find((tool) => tool.name === 'chart.zoomIn')!,
      {},
      'zoom-call',
    )
    transport.failUndoTokenOnce = 'undo:theme-call'

    await expect(runtime.undoTurn(context.runId)).rejects.toMatchObject({
      code: 'UNDO_CONFLICT',
      retryable: true,
    })
    expect(transport.undoCalls).toEqual(['undo:zoom-call', 'undo:theme-call'])
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'tool.undone', toolCallId: 'zoom-call' }),
    )

    await expect(runtime.undoTurn(context.runId)).resolves.toEqual(['theme-call'])
    await expect(runtime.undoTurn(context.runId)).resolves.toEqual([])
    expect(transport.undoCalls).toEqual(['undo:zoom-call', 'undo:theme-call', 'undo:theme-call'])
    expect(
      events
        .filter((event) => event.type === 'tool.undone')
        .map((event) => (event.type === 'tool.undone' ? event.toolCallId : '')),
    ).toEqual(['zoom-call', 'theme-call'])
  })
})
