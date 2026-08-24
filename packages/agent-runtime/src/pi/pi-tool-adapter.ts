import {
  CANONICAL_TOOL_REGISTRY,
  executeToolAsync,
  type CanonicalToolResult,
  type ToolCapabilityContext,
  type ToolDefinition,
  type ToolHostExecutor,
  type ToolPostconditionVerifier,
  type ToolPolicyEvaluator,
  type ToolRegistry,
  type ToolReplayResolver,
  type ToolSafety as CanonicalToolSafety,
} from '@363045841yyt/klinechart-ai-runtime/browser'

import type { RuntimeToolDefinition, RuntimeToolResult } from './types.js'
import type { ToolSafety } from '../contracts/ui.js'

type FailedCanonicalToolResult = Extract<CanonicalToolResult, { ok: false }>

export class CanonicalPiToolError extends Error {
  readonly result: FailedCanonicalToolResult

  constructor(result: FailedCanonicalToolResult) {
    super(result.error.message)
    this.name = 'CanonicalPiToolError'
    this.result = result
  }
}

export interface PiToolAdapterOptions {
  registry?: ToolRegistry
  capabilityContext: Omit<ToolCapabilityContext, 'audience'>
  identity: {
    sessionId: string
    runId: string
    turnId: string
  }
  execute: ToolHostExecutor
  policy?: ToolPolicyEvaluator
  verify?: ToolPostconditionVerifier
  replay?: ToolReplayResolver
  record?: (
    definition: ToolDefinition,
    input: unknown,
    result: CanonicalToolResult,
  ) => Promise<void>
}

function piSafety(safety: CanonicalToolSafety): ToolSafety {
  return safety === 'external-side-effect' ? 'destructive' : safety
}

function stringifyResult(result: CanonicalToolResult): string {
  if (!result.ok) return JSON.stringify(result.error)
  return result.content ?? JSON.stringify(result.data)
}

export function createPiTools(options: PiToolAdapterOptions): readonly RuntimeToolDefinition[] {
  const registry = options.registry ?? CANONICAL_TOOL_REGISTRY
  const capabilityContext: ToolCapabilityContext = {
    ...options.capabilityContext,
    audience: 'first-party',
  }
  const projection = registry.project(capabilityContext)

  return projection.available.map((definition): RuntimeToolDefinition => ({
    name: definition.name,
    label: definition.title,
    description: definition.description,
    parameters: definition.inputSchema,
    safety: piSafety(definition.policy.safety),
    reversible: definition.policy.reversible,
    executionMode: definition.policy.execution,
    summarizeInput: () => `${definition.title} input validated`,
    async execute(input, context): Promise<RuntimeToolResult> {
      const result = await executeToolAsync(
        { name: definition.name, input },
        {
          requestId: context.toolCallId,
          sessionId: options.identity.sessionId,
          runId: options.identity.runId,
          turnId: options.identity.turnId,
          toolCallId: context.toolCallId,
        },
        {
          registry,
          capabilityContext,
          execute: options.execute,
          policy: options.policy,
          verify: options.verify,
          replay: options.replay,
          signal: context.signal,
        },
      )
      await options.record?.(definition, input, result)
      if (!result.ok) throw new CanonicalPiToolError(result)
      return {
        content: stringifyResult(result),
        summary: `${definition.title} completed.`,
        undoToken: result.meta.undoToken,
        canonicalResult: result,
      }
    },
  }))
}
