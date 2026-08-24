import {
  RENDERER_TOOL_PROTOCOL_VERSION,
  parseRendererToolMessage,
  type RendererToolMessage,
  type RendererToolResponse,
  type RendererToolTarget,
} from './rendererProtocol.js'
import { CANONICAL_TOOL_REGISTRY } from './toolRegistry.js'

import type { ToolHostResult } from './canonicalExecutor.js'
import type {
  ChartToolCapabilities,
  ChartToolExecutionOptions,
  ChartToolVerificationOptions,
} from './chartToolHost.js'
import type { PostconditionResult, ToolError } from './toolRegistry.js'

export interface RendererChartToolHost {
  capabilities(): ChartToolCapabilities
  execute(name: string, input: unknown, options: ChartToolExecutionOptions): Promise<ToolHostResult>
  verify(
    name: string,
    input: unknown,
    output: unknown,
    options: ChartToolVerificationOptions,
  ): Promise<PostconditionResult>
  undo(
    undoToken: string,
    expectedChartRevision: number,
    signal?: AbortSignal,
  ): Promise<ToolHostResult>
  dispose(): void
}

export interface RendererToolHostEndpointOptions {
  readonly target: RendererToolTarget
  readonly host: RendererChartToolHost
}

function errorResponse(
  requestId: string,
  target: RendererToolTarget,
  error: ToolError,
): RendererToolResponse {
  return {
    protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
    requestId,
    target,
    kind: 'tool.error',
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    },
  }
}

function requestIdOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('requestId' in value)) return undefined
  const requestId = value.requestId
  return typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 160
    ? requestId
    : undefined
}

function invalidToolVersion(name: string, version: string): ToolError | undefined {
  const definition = CANONICAL_TOOL_REGISTRY.find(name)
  if (!definition) {
    return {
      code: 'TOOL_UNAVAILABLE',
      message: 'The requested tool is not in the canonical registry.',
      retryable: false,
    }
  }
  if (definition.version !== version) {
    return {
      code: 'INVALID_PROTOCOL',
      message: 'The requested tool version does not match the canonical registry.',
      retryable: false,
      details: { expectedVersion: definition.version, receivedVersion: version },
    }
  }
  return undefined
}

/** Browser-compatible endpoint for strict Renderer tool protocol requests. */
export class RendererToolHostEndpoint {
  readonly target: RendererToolTarget
  private readonly host: RendererChartToolHost
  private readonly inFlight = new Map<string, AbortController>()
  private disposed = false

  constructor(options: RendererToolHostEndpointOptions) {
    this.target = options.target
    this.host = options.host
  }

  async handle(value: unknown): Promise<RendererToolResponse | undefined> {
    const parsed = parseRendererToolMessage(value, { expectedTarget: this.target })
    if (!parsed.ok) {
      const requestId = requestIdOf(value)
      return requestId ? errorResponse(requestId, this.target, parsed.error) : undefined
    }
    const request = parsed.value
    if (!this.isRequest(request)) {
      return errorResponse(request.requestId, this.target, {
        code: 'INVALID_PROTOCOL',
        message: 'The Renderer host accepts request messages only.',
        retryable: false,
      })
    }
    if (this.disposed) {
      return errorResponse(request.requestId, this.target, {
        code: 'TARGET_GONE',
        message: 'The Renderer chart host has been disposed.',
        retryable: true,
      })
    }
    if (request.kind === 'tool.cancel') {
      this.inFlight.get(request.cancelRequestId)?.abort()
      return errorResponse(request.requestId, this.target, {
        code: 'CANCELLED',
        message: 'The Renderer tool request was cancelled.',
        retryable: true,
      })
    }
    if (request.kind === 'host.capabilities') {
      const capabilities = this.host.capabilities()
      return capabilities.ok
        ? {
            protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
            requestId: request.requestId,
            target: this.target,
            kind: 'host.capabilities.result',
            chartRevision: capabilities.chartRevision,
            supportedTools: [...capabilities.supportedTools],
          }
        : errorResponse(request.requestId, this.target, capabilities.error)
    }

    const versionError =
      request.kind === 'tool.execute' || request.kind === 'tool.verify'
        ? invalidToolVersion(request.toolName, request.toolVersion)
        : undefined
    if (versionError) return errorResponse(request.requestId, this.target, versionError)

    const controller = new AbortController()
    this.inFlight.set(request.requestId, controller)
    try {
      if (request.kind === 'tool.execute') {
        const result = await this.host.execute(request.toolName, request.input, {
          identity: request.identity,
          expectedChartRevision: request.expectedChartRevision,
          signal: controller.signal,
        })
        return {
          protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
          requestId: request.requestId,
          target: this.target,
          kind: 'tool.execute.result',
          result,
        }
      }
      if (request.kind === 'tool.verify') {
        const result = await this.host.verify(request.toolName, request.input, request.output, {
          identity: request.identity,
          expectedChartRevision: request.expectedChartRevision,
          signal: controller.signal,
        })
        return {
          protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
          requestId: request.requestId,
          target: this.target,
          kind: 'tool.verify.result',
          result,
        }
      }
      const result = await this.host.undo(
        request.undoToken,
        request.expectedChartRevision,
        controller.signal,
      )
      return {
        protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
        requestId: request.requestId,
        target: this.target,
        kind: 'tool.undo.result',
        result,
      }
    } finally {
      this.inFlight.delete(request.requestId)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const controller of this.inFlight.values()) controller.abort()
    this.inFlight.clear()
    this.host.dispose()
  }

  private isRequest(message: RendererToolMessage): message is Extract<
    RendererToolMessage,
    {
      kind: 'host.capabilities' | 'tool.execute' | 'tool.verify' | 'tool.undo' | 'tool.cancel'
    }
  > {
    return [
      'host.capabilities',
      'tool.execute',
      'tool.verify',
      'tool.undo',
      'tool.cancel',
    ].includes(message.kind)
  }
}

export function createRendererToolHostEndpoint(
  options: RendererToolHostEndpointOptions,
): RendererToolHostEndpoint {
  return new RendererToolHostEndpoint(options)
}
