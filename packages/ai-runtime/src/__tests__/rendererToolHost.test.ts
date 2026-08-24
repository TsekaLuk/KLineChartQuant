import { describe, expect, it, vi } from 'vitest'

import { RENDERER_TOOL_PROTOCOL_VERSION } from '../rendererProtocol'
import { RendererToolHostEndpoint, type RendererChartToolHost } from '../rendererToolHost'

import type { ToolHostResult } from '../canonicalExecutor'

const target = { windowId: 'window-1', chartId: 'primary', hostGeneration: 3 }
const identity = {
  requestId: 'request-1',
  sessionId: 'session-1',
  runId: 'run-1',
  turnId: 'turn-1',
  toolCallId: 'call-1',
}

function fixture(overrides: Partial<RendererChartToolHost> = {}): RendererChartToolHost {
  return {
    capabilities: vi.fn<RendererChartToolHost['capabilities']>(() => ({
      ok: true,
      chartRevision: 7,
      supportedTools: ['chart.getContext'],
    })),
    execute: vi.fn<RendererChartToolHost['execute']>(async () => ({
      ok: true,
      data: { chartRevision: 7 },
    })),
    verify: vi.fn<RendererChartToolHost['verify']>(async () => ({ ok: true })),
    undo: vi.fn<RendererChartToolHost['undo']>(async () => ({ ok: true, data: {} })),
    dispose: vi.fn<RendererChartToolHost['dispose']>(),
    ...overrides,
  }
}

function request(kind: 'host.capabilities' | 'tool.execute', requestId = 'request-1') {
  if (kind === 'host.capabilities') {
    return { protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION, requestId, target, kind }
  }
  return {
    protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
    requestId,
    target,
    kind,
    identity: { ...identity, requestId },
    toolName: 'chart.getContext',
    toolVersion: '1.0.0',
    input: {},
  }
}

describe('RendererToolHostEndpoint', () => {
  it('returns live capabilities and rejects mismatched targets before host dispatch', async () => {
    const host = fixture()
    const endpoint = new RendererToolHostEndpoint({ target, host })

    await expect(endpoint.handle(request('host.capabilities'))).resolves.toMatchObject({
      kind: 'host.capabilities.result',
      chartRevision: 7,
      supportedTools: ['chart.getContext'],
    })
    await expect(
      endpoint.handle({
        ...request('tool.execute'),
        target: { ...target, hostGeneration: target.hostGeneration - 1 },
      }),
    ).resolves.toMatchObject({ kind: 'tool.error', error: { code: 'TARGET_MISMATCH' } })
    expect(host.execute).not.toHaveBeenCalled()
  })

  it('rejects a non-canonical tool version before execution', async () => {
    const host = fixture()
    const endpoint = new RendererToolHostEndpoint({ target, host })
    await expect(
      endpoint.handle({ ...request('tool.execute'), toolVersion: '999.0.0' }),
    ).resolves.toMatchObject({ kind: 'tool.error', error: { code: 'INVALID_PROTOCOL' } })
    expect(host.execute).not.toHaveBeenCalled()
  })

  it('routes cancellation to the matching in-flight request', async () => {
    let aborted = false
    const host = fixture({
      execute: vi.fn<RendererChartToolHost['execute']>(
        async (_name, _input, options): Promise<ToolHostResult> =>
          new Promise((resolve) => {
            options.signal?.addEventListener('abort', () => {
              aborted = true
              resolve({
                ok: false,
                error: { code: 'CANCELLED', message: 'cancelled', retryable: true },
              })
            })
          }),
      ),
    })
    const endpoint = new RendererToolHostEndpoint({ target, host })
    const executing = endpoint.handle(request('tool.execute', 'execute-1'))
    await endpoint.handle({
      protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
      requestId: 'cancel-1',
      target,
      kind: 'tool.cancel',
      cancelRequestId: 'execute-1',
    })

    await expect(executing).resolves.toMatchObject({
      kind: 'tool.execute.result',
      result: { ok: false, error: { code: 'CANCELLED' } },
    })
    expect(aborted).toBe(true)
  })

  it('aborts pending work and fails closed after disposal', async () => {
    const host = fixture()
    const endpoint = new RendererToolHostEndpoint({ target, host })
    endpoint.dispose()

    await expect(endpoint.handle(request('host.capabilities'))).resolves.toMatchObject({
      kind: 'tool.error',
      error: { code: 'TARGET_GONE' },
    })
    expect(host.dispose).toHaveBeenCalledOnce()
  })
})
