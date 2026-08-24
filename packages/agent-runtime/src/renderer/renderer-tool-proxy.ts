import {
  RENDERER_TOOL_PROTOCOL_VERSION,
  parseRendererToolMessage,
  type RendererToolMessage,
  type RendererToolTarget,
  type ToolExecutionContext,
  type ToolHostResult,
} from '@363045841yyt/klinechart-ai-runtime/browser'

export interface RendererToolTransport {
  readonly target: RendererToolTarget
  request(message: RendererToolMessage, signal?: AbortSignal): Promise<unknown>
  close?(): void | Promise<void>
}

export interface RendererToolCapabilities {
  readonly target: RendererToolTarget
  readonly chartRevision: number
  readonly supportedTools: ReadonlySet<string>
}

function failure(code: string, message: string, retryable = false): ToolHostResult {
  return { ok: false, error: { code, message, retryable } }
}

export class RendererToolProxy {
  private transport?: RendererToolTransport
  private readonly id: () => string

  constructor(options: { readonly id?: () => string } = {}) {
    this.id = options.id ?? (() => globalThis.crypto.randomUUID())
  }

  attach(transport: RendererToolTransport): () => void {
    const previous = this.transport
    this.transport = transport
    void previous?.close?.()
    return () => {
      if (this.transport !== transport) return
      this.transport = undefined
      void transport.close?.()
    }
  }

  get target(): RendererToolTarget | undefined {
    return this.transport?.target
  }

  async capabilities(signal?: AbortSignal): Promise<RendererToolCapabilities | undefined> {
    const transport = this.transport
    if (!transport) return undefined
    const requestId = this.id()
    const response = await this.request(
      {
        protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
        requestId,
        target: transport.target,
        kind: 'host.capabilities',
      },
      signal,
    )
    if (!response || response.kind !== 'host.capabilities.result') return undefined
    return {
      target: transport.target,
      chartRevision: response.chartRevision,
      supportedTools: new Set(response.supportedTools),
    }
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
    signal: AbortSignal,
    expectedChartRevision?: number,
  ): Promise<ToolHostResult> {
    const transport = this.transport
    if (!transport) return failure('TARGET_GONE', 'No Renderer chart host is registered.', true)
    const response = await this.request(
      {
        protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
        requestId: context.identity.requestId,
        target: transport.target,
        kind: 'tool.execute',
        identity: context.identity,
        toolName: name,
        toolVersion: context.definition.version,
        input,
        expectedChartRevision,
      },
      signal,
    )
    if (!response) return failure('TARGET_GONE', 'The Renderer chart host did not respond.', true)
    if (response.kind === 'tool.error') return { ok: false, error: response.error }
    return response.kind === 'tool.execute.result'
      ? (response.result as ToolHostResult)
      : failure('INVALID_PROTOCOL', 'Renderer returned an unexpected execute response.')
  }

  async verify(
    name: string,
    input: unknown,
    output: unknown,
    context: ToolExecutionContext,
    signal: AbortSignal,
    expectedChartRevision?: number,
  ) {
    const transport = this.transport
    if (!transport) {
      return {
        ok: false as const,
        error: {
          code: 'POSTCONDITION_FAILED' as const,
          message: 'The Renderer chart host is gone.',
          retryable: true,
        },
      }
    }
    const response = await this.request(
      {
        protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
        requestId: context.identity.requestId,
        target: transport.target,
        kind: 'tool.verify',
        identity: context.identity,
        toolName: name,
        toolVersion: context.definition.version,
        input,
        output,
        expectedChartRevision,
      },
      signal,
    )
    if (response?.kind === 'tool.verify.result') {
      return response.result as {
        ok: boolean
        error?: {
          code?: 'POSTCONDITION_FAILED'
          message: string
          retryable: boolean
          details?: Readonly<Record<string, unknown>>
        }
      }
    }
    return {
      ok: false as const,
      error: {
        code: 'POSTCONDITION_FAILED' as const,
        message: 'Renderer returned an invalid verification response.',
        retryable: true,
      },
    }
  }

  async undo(
    identity: ToolExecutionContext['identity'],
    undoToken: string,
    expectedChartRevision: number,
    signal?: AbortSignal,
  ): Promise<ToolHostResult> {
    const transport = this.transport
    if (!transport) return failure('TARGET_GONE', 'No Renderer chart host is registered.', true)
    const response = await this.request(
      {
        protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
        requestId: identity.requestId,
        target: transport.target,
        kind: 'tool.undo',
        identity,
        undoToken,
        expectedChartRevision,
      },
      signal,
    )
    if (response?.kind === 'tool.undo.result') return response.result as ToolHostResult
    if (response?.kind === 'tool.error') return { ok: false, error: response.error }
    return failure('INVALID_PROTOCOL', 'Renderer returned an unexpected undo response.')
  }

  async close(): Promise<void> {
    const transport = this.transport
    this.transport = undefined
    await transport?.close?.()
  }

  private async request(
    message: RendererToolMessage,
    signal?: AbortSignal,
  ): Promise<RendererToolMessage | undefined> {
    const transport = this.transport
    if (!transport || signal?.aborted) return undefined
    let raw: unknown
    try {
      raw = await transport.request(message, signal)
    } catch {
      return undefined
    }
    if (this.transport !== transport) return undefined
    const parsed = parseRendererToolMessage(raw, { expectedTarget: transport.target })
    if (!parsed.ok || parsed.value.requestId !== message.requestId) return undefined
    return parsed.value
  }
}
