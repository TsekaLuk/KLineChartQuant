import { Type, type Static, type TProperties } from 'typebox'
import { Compile } from 'typebox/compile'

import type { ToolHostResult } from './canonicalExecutor.js'
import type { ToolError } from './toolRegistry.js'

export const RENDERER_TOOL_PROTOCOL_VERSION = 1 as const
export const MAX_RENDERER_TOOL_MESSAGE_BYTES = 512 * 1024

const strictObject = <Properties extends TProperties>(properties: Properties) =>
  Type.Object(properties, { additionalProperties: false })
const identifier = Type.String({ minLength: 1, maxLength: 160 })
const targetSchema = strictObject({
  windowId: identifier,
  chartId: identifier,
  hostGeneration: Type.Integer({ minimum: 0 }),
})
const identitySchema = strictObject({
  requestId: identifier,
  sessionId: identifier,
  runId: identifier,
  turnId: identifier,
  toolCallId: identifier,
})
const base = {
  protocolVersion: Type.Literal(RENDERER_TOOL_PROTOCOL_VERSION),
  requestId: identifier,
  target: targetSchema,
}

export const rendererToolMessageSchema = Type.Union([
  strictObject({ ...base, kind: Type.Literal('host.capabilities') }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.execute'),
    identity: identitySchema,
    toolName: identifier,
    toolVersion: identifier,
    input: Type.Unknown(),
    expectedChartRevision: Type.Optional(Type.Integer({ minimum: 0 })),
  }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.verify'),
    identity: identitySchema,
    toolName: identifier,
    toolVersion: identifier,
    input: Type.Unknown(),
    output: Type.Unknown(),
    expectedChartRevision: Type.Optional(Type.Integer({ minimum: 0 })),
  }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.undo'),
    identity: identitySchema,
    undoToken: identifier,
    expectedChartRevision: Type.Integer({ minimum: 0 }),
  }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.cancel'),
    cancelRequestId: identifier,
  }),
  strictObject({
    ...base,
    kind: Type.Literal('host.capabilities.result'),
    chartRevision: Type.Integer({ minimum: 0 }),
    supportedTools: Type.Array(identifier, { maxItems: 128 }),
  }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.execute.result'),
    result: Type.Unknown(),
  }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.verify.result'),
    result: Type.Unknown(),
  }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.undo.result'),
    result: Type.Unknown(),
  }),
  strictObject({
    ...base,
    kind: Type.Literal('tool.error'),
    error: strictObject({
      code: identifier,
      message: Type.String({ minLength: 1, maxLength: 1_000 }),
      retryable: Type.Boolean(),
      details: Type.Optional(Type.Record(identifier, Type.Unknown())),
    }),
  }),
])

export type RendererToolMessage = Static<typeof rendererToolMessageSchema>
export type RendererToolTarget = Static<typeof targetSchema>
export type RendererToolRequest = Extract<
  RendererToolMessage,
  { kind: 'host.capabilities' | 'tool.execute' | 'tool.verify' | 'tool.undo' | 'tool.cancel' }
>
export type RendererToolResponse = Exclude<RendererToolMessage, RendererToolRequest>

export type RendererToolParseResult =
  { ok: true; value: RendererToolMessage } | { ok: false; error: ToolError }

const validator = Compile(rendererToolMessageSchema)

function encodedSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export function rendererTargetsEqual(left: RendererToolTarget, right: RendererToolTarget): boolean {
  return (
    left.windowId === right.windowId &&
    left.chartId === right.chartId &&
    left.hostGeneration === right.hostGeneration
  )
}

export function parseRendererToolMessage(
  value: unknown,
  options: { readonly expectedTarget?: RendererToolTarget; readonly maxBytes?: number } = {},
): RendererToolParseResult {
  if (encodedSize(value) > (options.maxBytes ?? MAX_RENDERER_TOOL_MESSAGE_BYTES)) {
    return {
      ok: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Renderer tool message exceeds the configured payload limit.',
        retryable: false,
      },
    }
  }
  if (!validator.Check(value)) {
    const protocolVersion =
      typeof value === 'object' && value !== null && 'protocolVersion' in value
        ? (value as { protocolVersion?: unknown }).protocolVersion
        : undefined
    return {
      ok: false,
      error: {
        code:
          protocolVersion !== undefined && protocolVersion !== RENDERER_TOOL_PROTOCOL_VERSION
            ? 'INVALID_PROTOCOL'
            : 'INVALID_PAYLOAD',
        message: 'Renderer tool message does not match the strict protocol schema.',
        retryable: false,
      },
    }
  }
  if (options.expectedTarget && !rendererTargetsEqual(value.target, options.expectedTarget)) {
    return {
      ok: false,
      error: {
        code: 'TARGET_MISMATCH',
        message: 'Renderer tool message targets a different chart host.',
        retryable: false,
      },
    }
  }
  return { ok: true, value }
}

export function rendererToolErrorResult(error: ToolError): ToolHostResult {
  return { ok: false, error }
}
