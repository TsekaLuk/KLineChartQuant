import {
  executeToolAsync,
  type CanonicalToolResult,
  type ToolExecutionIdentity,
  type ToolHostExecutor,
  type ToolPolicyEvaluator,
} from './canonicalExecutor.js'
import {
  CANONICAL_TOOL_REGISTRY,
  ToolRegistry,
  type ToolCapabilityContext,
} from './toolRegistry.js'

import type { TSchema } from 'typebox'

export interface CanonicalMcpTool {
  name: string
  description: string
  inputSchema: TSchema
  outputSchema: TSchema
  annotations: {
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
  }
}

export interface CanonicalMcpCatalog {
  registryVersion: string
  tools: readonly CanonicalMcpTool[]
  unavailable: ReturnType<ToolRegistry['project']>['unavailable']
}

export interface CanonicalMcpCallResult {
  content: readonly { type: 'text'; text: string }[]
  structuredContent: CanonicalToolResult
  isError: boolean
}

export interface McpToolAdapterOptions {
  registry?: ToolRegistry
  capabilityContext:
    Omit<ToolCapabilityContext, 'audience'> | (() => Omit<ToolCapabilityContext, 'audience'>)
  execute: ToolHostExecutor
  policy?: ToolPolicyEvaluator
}

export interface McpToolAdapter {
  listTools(): CanonicalMcpCatalog
  callTool(
    name: string,
    input: unknown,
    identity: ToolExecutionIdentity,
    signal?: AbortSignal,
  ): Promise<CanonicalMcpCallResult>
}

function resolveContext(source: McpToolAdapterOptions['capabilityContext']): ToolCapabilityContext {
  const context = typeof source === 'function' ? source() : source
  return { ...context, audience: 'mcp' }
}

export function createMcpToolAdapter(options: McpToolAdapterOptions): McpToolAdapter {
  const registry = options.registry ?? CANONICAL_TOOL_REGISTRY

  return {
    listTools() {
      const projection = registry.project(resolveContext(options.capabilityContext))
      return {
        registryVersion: registry.version,
        tools: projection.available.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: {
            readOnlyHint: tool.policy.safety === 'read-only',
            destructiveHint:
              tool.policy.safety === 'destructive' || tool.policy.safety === 'external-side-effect',
            idempotentHint: tool.policy.safety === 'read-only',
          },
        })),
        unavailable: projection.unavailable,
      }
    },

    async callTool(name, input, identity, signal) {
      const result = await executeToolAsync({ name, input }, identity, {
        registry,
        capabilityContext: resolveContext(options.capabilityContext),
        execute: options.execute,
        policy: options.policy,
        signal,
      })
      const text = result.ok
        ? (result.content ?? JSON.stringify(result.data))
        : JSON.stringify(result.error)
      return {
        content: [{ type: 'text', text }],
        structuredContent: result,
        isError: !result.ok,
      }
    },
  }
}
