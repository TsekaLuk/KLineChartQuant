import { Type } from 'typebox'
import { describe, expect, it, vi } from 'vitest'

import { createMcpToolAdapter } from '../mcpAdapter'
import { createToolRegistry, defineTool } from '../toolRegistry'

import type { ToolHostExecutor } from '../canonicalExecutor'

const strict = { additionalProperties: false } as const
const registry = createToolRegistry('1.0.0', [
  defineTool({
    name: 'fixture.echo',
    version: '1.0.0',
    title: 'Echo',
    description: 'Echo one strictly validated string through the canonical MCP adapter.',
    inputSchema: Type.Object({ value: Type.String() }, strict),
    outputSchema: Type.Object({ value: Type.String() }, strict),
    audiences: ['first-party', 'mcp'],
    policy: {
      safety: 'read-only',
      confirmation: 'never',
      reversible: false,
      execution: 'parallel',
      timeoutMs: 1_000,
      syncCompatible: false,
    },
  }),
])

const identity = {
  requestId: 'request-1',
  sessionId: 'session-1',
  runId: 'run-1',
  turnId: 'turn-1',
  toolCallId: 'call-1',
}

describe('MCP canonical adapter', () => {
  it('rebuilds its catalog from a fresh capability probe', () => {
    const supportedTools = new Set<string>()
    const adapter = createMcpToolAdapter({
      registry,
      capabilityContext: () => ({ supportedTools }),
      execute: async (_name, input) => ({ ok: true, data: input }),
    })
    expect(adapter.listTools().tools).toEqual([])

    supportedTools.add('fixture.echo')
    expect(adapter.listTools().tools).toEqual([
      expect.objectContaining({
        name: 'fixture.echo',
        inputSchema: expect.objectContaining({ additionalProperties: false }),
        outputSchema: expect.objectContaining({ additionalProperties: false }),
      }),
    ])
  })

  it('returns canonical structured content and mirrors errors to isError', async () => {
    const execute = vi.fn<ToolHostExecutor>(async (_name, input) => ({
      ok: true,
      data: input,
    }))
    const adapter = createMcpToolAdapter({
      registry,
      capabilityContext: {},
      execute,
    })
    const success = await adapter.callTool('fixture.echo', { value: 'RSI' }, identity)
    expect(success).toMatchObject({
      isError: false,
      structuredContent: { ok: true, data: { value: 'RSI' } },
      content: [{ type: 'text', text: expect.stringContaining('RSI') }],
    })

    const invalid = await adapter.callTool('fixture.echo', { value: 14 }, identity)
    expect(invalid).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: { code: 'INVALID_ARGUMENTS', retryable: false },
      },
    })
    expect(execute).toHaveBeenCalledOnce()
  })
})
