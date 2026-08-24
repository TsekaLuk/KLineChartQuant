import { RENDERER_TOOL_PROTOCOL_VERSION } from '@363045841yyt/klinechart-ai-runtime/browser'
import { describe, expect, it } from 'vitest'

import { RendererToolProxy, type RendererToolTransport } from '../renderer/renderer-tool-proxy'

import type {
  RendererToolMessage,
  RendererToolTarget,
  ToolExecutionContext,
} from '@363045841yyt/klinechart-ai-runtime/browser'

const target: RendererToolTarget = { windowId: '1', chartId: 'primary', hostGeneration: 1 }

const identity = {
  requestId: 'request-1',
  sessionId: 'session-1',
  runId: 'run-1',
  turnId: 'turn-1',
  toolCallId: 'call-1',
}

const context = {
  identity,
  definition: { version: '1.0.0' },
} as unknown as ToolExecutionContext

/** 用可编程的 reply 驱动 proxy，无需真实 MessagePort。 */
class StubTransport implements RendererToolTransport {
  readonly sent: RendererToolMessage[] = []
  closed = 0

  constructor(
    readonly target: RendererToolTarget,
    private readonly reply: (message: RendererToolMessage) => unknown,
  ) {}

  async request(message: RendererToolMessage): Promise<unknown> {
    this.sent.push(message)
    return this.reply(message)
  }

  close(): void {
    this.closed += 1
  }
}

function respond(message: RendererToolMessage, patch: Record<string, unknown>) {
  return {
    protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
    requestId: message.requestId,
    target: message.target,
    ...patch,
  }
}

describe('RendererToolProxy without an attached host', () => {
  it('fails closed on every operation instead of hanging', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    const signal = new AbortController().signal

    expect(proxy.target).toBeUndefined()
    expect(await proxy.capabilities()).toBeUndefined()
    expect(await proxy.execute('chart.getState', {}, context, signal)).toMatchObject({
      ok: false,
      error: { code: 'TARGET_GONE', retryable: true },
    })
    expect(await proxy.verify('chart.getState', {}, {}, context, signal)).toMatchObject({
      ok: false,
      error: { code: 'POSTCONDITION_FAILED', retryable: true },
    })
    expect(await proxy.undo(identity, 'undo-1', 3)).toMatchObject({
      ok: false,
      error: { code: 'TARGET_GONE', retryable: true },
    })
    await expect(proxy.close()).resolves.toBeUndefined()
  })
})

describe('RendererToolProxy transport lifecycle', () => {
  it('closes the previous transport when a reloaded Renderer attaches', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    const first = new StubTransport(target, (message) =>
      respond(message, { kind: 'host.capabilities.result', chartRevision: 1, supportedTools: [] }),
    )
    const second = new StubTransport({ ...target, hostGeneration: 2 }, (message) =>
      respond(message, {
        kind: 'host.capabilities.result',
        chartRevision: 7,
        supportedTools: ['chart.getState'],
      }),
    )

    proxy.attach(first)
    const detachSecond = proxy.attach(second)

    expect(first.closed).toBe(1)
    expect(proxy.target).toEqual(second.target)
    expect(await proxy.capabilities()).toEqual({
      target: second.target,
      chartRevision: 7,
      supportedTools: new Set(['chart.getState']),
    })

    detachSecond()
    expect(second.closed).toBe(1)
    expect(proxy.target).toBeUndefined()
  })

  it('ignores a detach handle that no longer owns the transport', () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    const first = new StubTransport(target, (message) => respond(message, { kind: 'tool.error' }))
    const second = new StubTransport(target, (message) => respond(message, { kind: 'tool.error' }))

    const detachFirst = proxy.attach(first)
    proxy.attach(second)
    detachFirst()

    expect(proxy.target).toEqual(second.target)
    expect(second.closed).toBe(0)
  })

  it('closes the active transport and forgets the target', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    const transport = new StubTransport(target, (message) =>
      respond(message, { kind: 'tool.error' }),
    )
    proxy.attach(transport)

    await proxy.close()

    expect(transport.closed).toBe(1)
    expect(proxy.target).toBeUndefined()
  })
})

describe('RendererToolProxy response handling', () => {
  it('surfaces a Renderer tool error verbatim', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    proxy.attach(
      new StubTransport(target, (message) =>
        respond(message, {
          kind: 'tool.error',
          error: { code: 'STATE_CONFLICT', message: 'The chart moved on.', retryable: true },
        }),
      ),
    )

    expect(
      await proxy.execute('indicators.add', {}, context, new AbortController().signal, 4),
    ).toEqual({
      ok: false,
      error: { code: 'STATE_CONFLICT', message: 'The chart moved on.', retryable: true },
    })
    expect(await proxy.undo(identity, 'undo-1', 4)).toMatchObject({
      ok: false,
      error: { code: 'STATE_CONFLICT' },
    })
  })

  it('rejects a response whose kind does not match the request', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    proxy.attach(
      new StubTransport(target, (message) =>
        respond(message, { kind: 'tool.verify.result', result: { ok: true } }),
      ),
    )

    expect(
      await proxy.execute('indicators.add', {}, context, new AbortController().signal),
    ).toEqual({
      ok: false,
      error: {
        code: 'INVALID_PROTOCOL',
        message: 'Renderer returned an unexpected execute response.',
        retryable: false,
      },
    })
    expect(await proxy.undo(identity, 'undo-1', 1)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PROTOCOL' },
    })
    expect(await proxy.capabilities()).toBeUndefined()
  })

  it('treats a mismatched requestId as no response at all', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    proxy.attach(
      new StubTransport(target, (message) => ({
        ...respond(message, { kind: 'tool.execute.result', result: { ok: true } }),
        requestId: 'other-request',
      })),
    )

    expect(
      await proxy.execute('indicators.add', {}, context, new AbortController().signal),
    ).toMatchObject({ ok: false, error: { code: 'TARGET_GONE', retryable: true } })
  })

  it('treats a transport rejection as an unavailable target', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    proxy.attach(
      new StubTransport(target, () => {
        throw new Error('port closed')
      }),
    )

    expect(
      await proxy.execute('indicators.add', {}, context, new AbortController().signal),
    ).toMatchObject({ ok: false, error: { code: 'TARGET_GONE' } })
    expect(
      await proxy.verify('indicators.add', {}, {}, context, new AbortController().signal),
    ).toMatchObject({ ok: false, error: { code: 'POSTCONDITION_FAILED' } })
  })

  it('does not dispatch once the caller aborted', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    const transport = new StubTransport(target, (message) =>
      respond(message, { kind: 'tool.execute.result', result: { ok: true } }),
    )
    proxy.attach(transport)
    const controller = new AbortController()
    controller.abort()

    expect(await proxy.execute('indicators.add', {}, context, controller.signal)).toMatchObject({
      ok: false,
      error: { code: 'TARGET_GONE' },
    })
    expect(transport.sent).toEqual([])
  })

  it('returns the verification result reported by the Renderer', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    proxy.attach(
      new StubTransport(target, (message) =>
        respond(message, { kind: 'tool.verify.result', result: { ok: true } }),
      ),
    )

    expect(
      await proxy.verify('indicators.add', {}, {}, context, new AbortController().signal, 4),
    ).toEqual({ ok: true })
  })

  it('returns the execute and undo results reported by the Renderer', async () => {
    const proxy = new RendererToolProxy({ id: () => 'request-1' })
    proxy.attach(
      new StubTransport(target, (message) =>
        respond(message, {
          kind: message.kind === 'tool.undo' ? 'tool.undo.result' : 'tool.execute.result',
          result: { ok: true, data: { applied: true } },
        }),
      ),
    )

    expect(
      await proxy.execute('indicators.add', {}, context, new AbortController().signal),
    ).toEqual({ ok: true, data: { applied: true } })
    expect(await proxy.undo(identity, 'undo-1', 4)).toEqual({ ok: true, data: { applied: true } })
  })
})
