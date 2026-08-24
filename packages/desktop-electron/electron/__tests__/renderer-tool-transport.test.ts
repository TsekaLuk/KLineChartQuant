import { EventEmitter } from 'node:events'

import { RENDERER_TOOL_PROTOCOL_VERSION } from '@363045841yyt/klinechart-ai-runtime/browser'
import { describe, expect, it } from 'vitest'

import { AGENT_PORT_TOOL_REQUEST, AGENT_PORT_TOOL_RESPONSE } from '../agent-ipc-channels'
import { ElectronRendererToolTransport } from '../renderer-tool-transport'

import type { MessagePortMain } from 'electron'

class FakePort extends EventEmitter {
  readonly posted: unknown[] = []
  closed = false

  postMessage(value: unknown): void {
    this.posted.push(value)
  }
  close(): void {
    this.closed = true
    this.emit('close')
  }
}

const target = { windowId: '1', chartId: 'primary', hostGeneration: 2 }
const request = {
  protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
  requestId: 'request-1',
  target,
  kind: 'host.capabilities' as const,
}

describe('ElectronRendererToolTransport', () => {
  it('resolves only a strict response for its active target', async () => {
    const port = new FakePort()
    const transport = new ElectronRendererToolTransport({
      port: port as unknown as MessagePortMain,
      target,
    })
    const result = transport.request(request)
    expect(port.posted).toEqual([{ channel: AGENT_PORT_TOOL_REQUEST, message: request }])

    port.emit('message', {
      data: {
        channel: AGENT_PORT_TOOL_RESPONSE,
        message: {
          protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
          requestId: request.requestId,
          target: { ...target, hostGeneration: 1 },
          kind: 'host.capabilities.result',
          chartRevision: 4,
          supportedTools: [],
        },
      },
    })
    port.emit('message', {
      data: {
        channel: AGENT_PORT_TOOL_RESPONSE,
        message: {
          protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
          requestId: request.requestId,
          target,
          kind: 'host.capabilities.result',
          chartRevision: 5,
          supportedTools: ['chart.getContext'],
        },
      },
    })

    await expect(result).resolves.toMatchObject({
      kind: 'host.capabilities.result',
      chartRevision: 5,
    })
  })

  it('sends cancellation for the exact request and rejects pending work on close', async () => {
    const port = new FakePort()
    let id = 0
    const transport = new ElectronRendererToolTransport({
      port: port as unknown as MessagePortMain,
      target,
      id: () => `cancel-${++id}`,
    })
    const controller = new AbortController()
    const aborted = transport.request(request, controller.signal)
    controller.abort()
    await expect(aborted).rejects.toThrow('cancelled')
    expect(port.posted.at(-1)).toMatchObject({
      channel: AGENT_PORT_TOOL_REQUEST,
      message: { kind: 'tool.cancel', requestId: 'cancel-1', cancelRequestId: 'request-1' },
    })

    const pending = transport.request({ ...request, requestId: 'request-2' })
    transport.close()
    await expect(pending).rejects.toThrow('disconnected')
    expect(port.closed).toBe(true)
  })

  it('rejects a request addressed to another generation', async () => {
    const port = new FakePort()
    const transport = new ElectronRendererToolTransport({
      port: port as unknown as MessagePortMain,
      target,
    })
    await expect(
      transport.request({
        ...request,
        target: { ...target, hostGeneration: target.hostGeneration - 1 },
      }),
    ).rejects.toThrow('does not match')
    expect(port.posted).toEqual([])
  })
})
