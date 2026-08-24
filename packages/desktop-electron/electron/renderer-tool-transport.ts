import {
  RENDERER_TOOL_PROTOCOL_VERSION,
  parseRendererToolMessage,
  rendererTargetsEqual,
  type RendererToolMessage,
  type RendererToolTarget,
} from '@363045841yyt/klinechart-ai-runtime/browser'

import { AGENT_PORT_TOOL_REQUEST, AGENT_PORT_TOOL_RESPONSE } from './agent-ipc-channels'

import type { RendererToolTransport } from '@363045841yyt/klinechart-agent-runtime'
import type { MessagePortMain } from 'electron'

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: Error) => void
  readonly signal?: AbortSignal
  readonly onAbort?: () => void
}

export class ElectronRendererToolTransport implements RendererToolTransport {
  readonly target: RendererToolTarget
  private readonly port: MessagePortMain
  private readonly id: () => string
  private readonly pending = new Map<string, PendingRequest>()
  private closed = false

  constructor(options: {
    readonly port: MessagePortMain
    readonly target: RendererToolTarget
    readonly id?: () => string
  }) {
    this.port = options.port
    this.target = options.target
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
    this.port.on('message', (event) => this.receive(event.data))
  }

  request(message: RendererToolMessage, signal?: AbortSignal): Promise<unknown> {
    if (this.closed || signal?.aborted) {
      return Promise.reject(new Error('The Renderer chart target is unavailable.'))
    }
    if (!rendererTargetsEqual(message.target, this.target)) {
      return Promise.reject(new Error('The Renderer chart target does not match this transport.'))
    }
    return new Promise((resolve, reject) => {
      const onAbort = signal
        ? () => {
            this.pending.delete(message.requestId)
            this.port.postMessage(
              {
                channel: AGENT_PORT_TOOL_REQUEST,
                message: {
                  protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
                  requestId: this.id(),
                  target: this.target,
                  kind: 'tool.cancel',
                  cancelRequestId: message.requestId,
                },
              },
              [],
            )
            reject(new Error('The Renderer tool request was cancelled.'))
          }
        : undefined
      this.pending.set(message.requestId, { resolve, reject, signal, onAbort })
      signal?.addEventListener('abort', onAbort!, { once: true })
      this.port.postMessage({ channel: AGENT_PORT_TOOL_REQUEST, message }, [])
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const request of this.pending.values()) {
      request.signal?.removeEventListener('abort', request.onAbort!)
      request.reject(new Error('The Renderer chart target was disconnected.'))
    }
    this.pending.clear()
    this.port.close()
  }

  private receive(value: unknown): void {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('channel' in value) ||
      value.channel !== AGENT_PORT_TOOL_RESPONSE ||
      !('message' in value)
    ) {
      return
    }
    const parsed = parseRendererToolMessage(value.message, { expectedTarget: this.target })
    if (!parsed.ok) return
    const response = parsed.value
    if (
      ![
        'host.capabilities.result',
        'tool.execute.result',
        'tool.verify.result',
        'tool.undo.result',
        'tool.error',
      ].includes(response.kind)
    ) {
      return
    }
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    this.pending.delete(response.requestId)
    pending.signal?.removeEventListener('abort', pending.onAbort!)
    pending.resolve(response)
  }
}
