import { InMemorySessionRepo } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'

import {
  AgentApplicationService,
  AgentRuntimeError,
  RuntimeSessionService,
  type AgentRunUiEventInput,
  type AgentUiEvent,
  type PiRunPlan,
  type PiRunResult,
  type RunDriver,
} from '../index'

class ControlledDriver implements RunDriver {
  readonly events: AgentRunUiEventInput[] = []
  private emit!: (event: AgentRunUiEventInput) => Promise<void>
  private resolve!: (result: PiRunResult) => void
  private reject!: (error: unknown) => void

  run(
    _plan: PiRunPlan,
    emit: (event: AgentRunUiEventInput) => Promise<void>,
  ): Promise<PiRunResult> {
    this.emit = emit
    return new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
  abort(): void {
    this.reject?.(new AgentRuntimeError('ABORTED', 'cancelled'))
  }
  async waitForIdle(): Promise<void> {}
  async push(event: AgentRunUiEventInput): Promise<void> {
    this.events.push(event)
    await this.emit(event)
  }
  complete(result: PiRunResult = { text: 'done', completedToolCount: 0 }): void {
    this.resolve(result)
  }
}

/** 模拟 Provider 侧失败，用于验证 run 走 failed 分支而不是 cancelled。 */
class FailingDriver implements RunDriver {
  async run(): Promise<PiRunResult> {
    throw new AgentRuntimeError('PROVIDER_ERROR', 'The Provider rejected the request.')
  }
  abort(): void {}
  async waitForIdle(): Promise<void> {}
}

function fixture() {
  let id = 0
  let now = 1_000
  const drivers: ControlledDriver[] = []
  const sessions = new RuntimeSessionService({
    repository: new InMemorySessionRepo(),
    id: () => `session-${++id}`,
    now: () => ++now,
  })
  const service = new AgentApplicationService({
    sessions,
    id: () => `runtime-${++id}`,
    now: () => ++now,
    createDriver: () => {
      const driver = new ControlledDriver()
      drivers.push(driver)
      return driver
    },
    createPlan: (context) => ({ sessionId: context.sessionId, runId: context.runId }) as PiRunPlan,
  })
  return { service, drivers }
}

async function tick() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe('AgentApplicationService', () => {
  it('publishes Provider status after test and credential deletion', async () => {
    let connected = false
    const events: AgentUiEvent[] = []
    const runtime = new AgentApplicationService({
      sessions: new RuntimeSessionService({ repository: new InMemorySessionRepo() }),
      createPlan: () => ({}) as PiRunPlan,
      provider: {
        getStatus: () =>
          connected
            ? { state: 'connected', providerLabel: 'Faux', modelLabel: 'fast' }
            : { state: 'not-configured', providerLabel: 'Faux' },
        listModels: async () => ({ models: [], refreshedAt: 1 }),
        test: async () => {
          connected = true
          return {
            compatible: true,
            model: 'fast',
            latencyMs: 1,
            stages: [
              { stage: 'catalog' as const, ok: true, latencyMs: 1 },
              { stage: 'text' as const, ok: true, latencyMs: 1 },
              { stage: 'tool' as const, ok: true, latencyMs: 1 },
            ],
          }
        },
        deleteCredential: async () => {
          connected = false
        },
      },
    })
    runtime.subscribe((event) => events.push(event))
    await runtime.testProvider({
      baseUrl: 'https://example.invalid',
      apiKey: 'ephemeral',
      model: 'fast',
    })
    await runtime.deleteProviderCredential()
    expect(
      events
        .filter((event) => event.type === 'provider.status.changed')
        .map((event) => (event.type === 'provider.status.changed' ? event.status.state : '')),
    ).toEqual(['testing', 'connected', 'not-configured'])
  })

  it('persists ordered start, stream, and terminal events before publishing them', async () => {
    const { service, drivers } = fixture()
    const session = await service.createSession()
    const events: AgentUiEvent[] = []
    service.subscribe((event) => events.push(event))
    const { runId } = await service.startRun({
      sessionId: session.id,
      prompt: 'Inspect RSI',
      readOnly: true,
    })
    await tick()
    await drivers[0]!.push({
      type: 'assistant.message.started',
      messageId: 'assistant-1',
      createdAt: 1_100,
    })
    await drivers[0]!.push({
      type: 'assistant.text.delta',
      messageId: 'assistant-1',
      delta: 'Neutral',
    })
    await drivers[0]!.push({ type: 'assistant.message.completed', messageId: 'assistant-1' })
    drivers[0]!.complete({
      text: 'Neutral',
      completedToolCount: 0,
      usage: { inputTokens: 4, outputTokens: 2 },
    })
    await tick()

    expect(events.filter((event) => 'runId' in event).map((event) => event.type)).toEqual([
      'run.started',
      'user.message.created',
      'assistant.message.started',
      'assistant.text.delta',
      'assistant.message.completed',
      'run.completed',
    ])
    const snapshot = await service.openSession(session.id)
    expect(snapshot.messages.map((message) => message.content)).toEqual(['Inspect RSI', 'Neutral'])
    expect(snapshot.runs.find((run) => run.id === runId)?.status).toBe('completed')
    expect(snapshot.lastSequence).toBeGreaterThan(0)
  })

  it('enforces one active run and rejects stale cancellation', async () => {
    const { service } = fixture()
    const session = await service.createSession()
    const first = await service.startRun({ sessionId: session.id, prompt: 'One', readOnly: true })
    await expect(
      service.startRun({ sessionId: session.id, prompt: 'Two', readOnly: true }),
    ).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
    await service.cancelRun(first.runId)
    await expect(service.cancelRun(first.runId)).rejects.toMatchObject({ code: 'RUN_NOT_ACTIVE' })
  })

  it('marks cancellation partial only after a successful reversible tool', async () => {
    const { service, drivers } = fixture()
    const session = await service.createSession()
    const events: AgentUiEvent[] = []
    service.subscribe((event) => events.push(event))
    const run = await service.startRun({
      sessionId: session.id,
      prompt: 'Add EMA',
      readOnly: false,
    })
    await tick()
    await drivers[0]!.push({
      type: 'tool.finished',
      result: {
        id: 'tool-1',
        runId: run.runId,
        name: 'indicator.add',
        label: 'Add EMA',
        status: 'succeeded',
        inputSummary: 'EMA 20',
        resultSummary: 'Added',
        safety: 'reversible-write',
        reversible: true,
      },
    })
    await service.cancelRun(run.runId)
    expect(events.find((event) => event.type === 'run.cancelled')).toMatchObject({ partial: true })
  })

  it('retries on a new run/turn branch and preserves the original prompt', async () => {
    const { service, drivers } = fixture()
    const session = await service.createSession()
    const first = await service.startRun({
      sessionId: session.id,
      prompt: 'Inspect RSI',
      readOnly: true,
    })
    await tick()
    drivers[0]!.complete()
    await tick()
    const retry = await service.retryRun(first.runId)
    await tick()
    expect(retry.runId).not.toBe(first.runId)
    const retryStart = (await service.openSession(session.id)).messages.at(-1)
    expect(retryStart?.content).toBe('Inspect RSI')
    await service.cancelRun(retry.runId)
  })

  it('reports a driver failure as a failed run and logs its error code', async () => {
    const records: Array<{ event: string; fields?: Record<string, unknown> }> = []
    let id = 0
    const drivers: FailingDriver[] = []
    const service = new AgentApplicationService({
      sessions: new RuntimeSessionService({
        repository: new InMemorySessionRepo(),
        id: () => `session-${++id}`,
      }),
      id: () => `runtime-${++id}`,
      createDriver: () => {
        const driver = new FailingDriver()
        drivers.push(driver)
        return driver
      },
      createPlan: () => ({}) as PiRunPlan,
      logger: { write: (record) => void records.push(record) },
    })
    const session = await service.createSession()
    const events: AgentUiEvent[] = []
    service.subscribe((event) => events.push(event))

    const run = await service.startRun({ sessionId: session.id, prompt: 'Fail', readOnly: true })
    await tick()

    expect(events.find((event) => event.type === 'run.failed')).toMatchObject({
      error: { code: 'PROVIDER_ERROR' },
    })
    expect(
      (await service.openSession(session.id)).runs.find((entry) => entry.id === run.runId),
    ).toMatchObject({ status: 'failed' })
    expect(records.map((record) => record.event)).toEqual(['agent.run.failed'])
    expect(records[0]?.fields).toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('protects an active run from session deletion and concurrent retry', async () => {
    const { service } = fixture()
    const session = await service.createSession()
    const run = await service.startRun({ sessionId: session.id, prompt: 'One', readOnly: true })
    await tick()

    await expect(service.deleteSession(session.id)).rejects.toMatchObject({ code: 'RUN_ACTIVE' })
    await expect(service.retryRun(run.runId)).rejects.toMatchObject({ code: 'RUN_ACTIVE' })

    await service.cancelRun(run.runId)
    await service.deleteSession(session.id)
    expect(await service.listSessions()).toEqual([])
  })

  it('refuses to retry a finished run while its session is busy again', async () => {
    const { service, drivers } = fixture()
    const session = await service.createSession()
    const first = await service.startRun({ sessionId: session.id, prompt: 'One', readOnly: true })
    await tick()
    drivers[0]!.complete()
    await tick()
    const second = await service.startRun({ sessionId: session.id, prompt: 'Two', readOnly: true })
    await tick()

    await expect(service.retryRun(first.runId)).rejects.toMatchObject({ code: 'RUN_ACTIVE' })

    await service.cancelRun(second.runId)
  })

  it('renames a session and republishes the catalogue', async () => {
    const { service } = fixture()
    const session = await service.createSession()
    const events: AgentUiEvent[] = []
    service.subscribe((event) => events.push(event))

    await service.renameSession(session.id, 'Momentum review')

    expect(events).toMatchObject([{ type: 'sessions.changed' }])
    expect((await service.listSessions())[0]?.title).toBe('Momentum review')
  })

  it('fails closed when no tool runtime or Provider adapter is installed', async () => {
    const { service } = fixture()

    await expect(service.confirmTool('confirmation-1', 'confirmed')).rejects.toMatchObject({
      code: 'RUN_NOT_ACTIVE',
    })
    await expect(service.undoTurn('run-1')).rejects.toMatchObject({ code: 'RUN_NOT_ACTIVE' })
    await expect(
      service.testProvider({ baseUrl: 'https://example.invalid', model: 'fast' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    await expect(
      service.listProviderModels({ baseUrl: 'https://example.invalid' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    await expect(service.deleteProviderCredential()).resolves.toBeUndefined()
    expect(await service.getProviderStatus()).toMatchObject({
      state: 'not-configured',
      providerLabel: '302.ai',
    })
  })

  it('stops publishing to a listener after it unsubscribes', async () => {
    const { service } = fixture()
    const events: AgentUiEvent[] = []
    const unsubscribe = service.subscribe((event) => events.push(event))

    await service.createSession()
    unsubscribe()
    await service.createSession()

    expect(events).toHaveLength(1)
  })

  it('interrupts every owned run when the host shuts down', async () => {
    const { service } = fixture()
    const first = await service.createSession()
    const second = await service.createSession()
    const events: AgentUiEvent[] = []
    service.subscribe((event) => events.push(event))
    await service.startRun({ sessionId: first.id, prompt: 'One', readOnly: true })
    await service.startRun({ sessionId: second.id, prompt: 'Two', readOnly: true })
    await tick()

    await service.interruptOwnedRuns()

    expect(events.filter((event) => event.type === 'run.cancelled')).toHaveLength(2)
    await expect(
      service.startRun({ sessionId: first.id, prompt: 'Again', readOnly: true }),
    ).resolves.toMatchObject({ runId: expect.any(String) })
  })

  it('delegates run trace export to the session store', async () => {
    const { service, drivers } = fixture()
    const session = await service.createSession()
    const run = await service.startRun({ sessionId: session.id, prompt: 'Inspect', readOnly: true })
    await tick()
    drivers[0]!.complete()
    await tick()

    expect(await service.exportRunTrace(run.runId)).toMatchObject({
      runId: run.runId,
      sessionId: session.id,
      status: 'completed',
      readOnly: true,
    })
  })

  it('continues the durable event sequence after a runtime restart', async () => {
    const repository = new InMemorySessionRepo()
    let id = 0
    const createService = () => {
      const drivers: ControlledDriver[] = []
      const service = new AgentApplicationService({
        sessions: new RuntimeSessionService({ repository, id: () => `session-${++id}` }),
        id: () => `runtime-${++id}`,
        createDriver: () => {
          const driver = new ControlledDriver()
          drivers.push(driver)
          return driver
        },
        createPlan: (context) =>
          ({ sessionId: context.sessionId, runId: context.runId }) as PiRunPlan,
      })
      return { service, drivers }
    }

    const firstRuntime = createService()
    const session = await firstRuntime.service.createSession()
    await firstRuntime.service.startRun({ sessionId: session.id, prompt: 'First', readOnly: true })
    await tick()
    firstRuntime.drivers[0]!.complete()
    await tick()
    const previousSequence = (await firstRuntime.service.openSession(session.id)).lastSequence

    const restarted = createService()
    await restarted.service.initialize()
    const events: AgentUiEvent[] = []
    restarted.service.subscribe((event) => events.push(event))
    const run = await restarted.service.startRun({
      sessionId: session.id,
      prompt: 'Second',
      readOnly: true,
    })
    await tick()

    expect(events[0]?.sequence).toBe(previousSequence + 1)
    await restarted.service.cancelRun(run.runId)
  })
})
