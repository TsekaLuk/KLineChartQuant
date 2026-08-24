import {
  createMcpToolAdapter,
  createToolRegistry,
  defineTool,
  type ToolHostExecutor,
  type ToolPolicyEvaluator,
} from '@363045841yyt/klinechart-ai-runtime'
import { Type } from 'typebox'
import { describe, expect, it } from 'vitest'

import { CanonicalPiToolError, createPiTools } from '../pi/pi-tool-adapter'

const strict = { additionalProperties: false } as const
const registry = createToolRegistry('1.0.0', [
  defineTool({
    name: 'fixture.echo',
    version: '1.0.0',
    title: 'Echo',
    description: 'Echo one strictly validated string through both canonical tool adapters.',
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
const execute: ToolHostExecutor = async (_name, input) => ({ ok: true, data: input })
const deniedPolicy: ToolPolicyEvaluator = async () => ({
  allowed: false,
  error: { code: 'POLICY_DENIED', message: 'Denied by fixture policy.', retryable: false },
})
const failedHost: ToolHostExecutor = async () => ({
  ok: false,
  error: { code: 'NO_DATA', message: 'No bars are available.', retryable: false },
})
const baseIdentity = {
  sessionId: 'session-1',
  runId: 'run-1',
  turnId: 'turn-1',
}

describe('Pi canonical adapter', () => {
  async function invokePi(
    input: unknown,
    host: ToolHostExecutor = execute,
  ): Promise<CanonicalPiToolError | undefined> {
    const tool = createPiTools({
      registry,
      capabilityContext: {},
      identity: baseIdentity,
      execute: host,
    })[0]!
    try {
      await tool.execute(input, {
        runId: 'run-1',
        toolCallId: 'call-1',
        signal: new AbortController().signal,
        progress: () => undefined,
      })
    } catch (error) {
      if (error instanceof CanonicalPiToolError) return error
      throw error
    }
    return undefined
  }

  it('runs in process with no MCP transport and preserves the canonical result', async () => {
    const tools = createPiTools({
      registry,
      capabilityContext: {},
      identity: baseIdentity,
      execute,
    })
    expect(tools).toHaveLength(1)
    const result = await tools[0]!.execute(
      { value: 'RSI' },
      {
        runId: 'run-1',
        toolCallId: 'call-1',
        signal: new AbortController().signal,
        progress: () => undefined,
      },
    )
    expect(result).toMatchObject({
      content: expect.stringContaining('RSI'),
      summary: expect.stringContaining('Echo'),
      canonicalResult: { ok: true, data: { value: 'RSI' } },
    })
  })

  it('matches MCP validation and policy results for identical fixtures', async () => {
    const mcp = createMcpToolAdapter({
      registry,
      capabilityContext: {},
      execute,
      policy: deniedPolicy,
    })
    const pi = createPiTools({
      registry,
      capabilityContext: {},
      identity: baseIdentity,
      execute,
      policy: deniedPolicy,
    })[0]!

    const mcpResult = await mcp.callTool(
      'fixture.echo',
      { value: 'RSI' },
      {
        requestId: 'call-1',
        ...baseIdentity,
        toolCallId: 'call-1',
      },
    )
    let piError: CanonicalPiToolError | undefined
    try {
      await pi.execute(
        { value: 'RSI' },
        {
          runId: 'run-1',
          toolCallId: 'call-1',
          signal: new AbortController().signal,
          progress: () => undefined,
        },
      )
    } catch (error) {
      if (error instanceof CanonicalPiToolError) piError = error
    }

    expect(piError?.result).toMatchObject({
      ok: false,
      error: { code: 'POLICY_DENIED', retryable: false },
    })
    expect(mcpResult.structuredContent).toMatchObject({
      ok: false,
      error: { code: piError?.result.ok === false ? piError.result.error.code : undefined },
    })
  })

  it('matches MCP validation and domain failures for identical fixtures', async () => {
    const invalidMcp = await createMcpToolAdapter({
      registry,
      capabilityContext: {},
      execute,
    }).callTool(
      'fixture.echo',
      { value: 14 },
      {
        requestId: 'call-1',
        ...baseIdentity,
        toolCallId: 'call-1',
      },
    )
    const invalidPi = await invokePi({ value: 14 })
    expect(invalidPi?.result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENTS' },
    })
    expect(invalidMcp.structuredContent).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENTS' },
    })

    const failedMcp = await createMcpToolAdapter({
      registry,
      capabilityContext: {},
      execute: failedHost,
    }).callTool(
      'fixture.echo',
      { value: 'RSI' },
      {
        requestId: 'call-1',
        ...baseIdentity,
        toolCallId: 'call-1',
      },
    )
    const failedPi = await invokePi({ value: 'RSI' }, failedHost)
    expect(failedPi?.result).toMatchObject({ ok: false, error: { code: 'NO_DATA' } })
    expect(failedMcp.structuredContent).toMatchObject({
      ok: false,
      error: { code: 'NO_DATA' },
    })
  })

  it('re-probes Pi capabilities whenever a new turn tool list is created', () => {
    const supportedTools = new Set<string>()
    const options = {
      registry,
      capabilityContext: { supportedTools },
      identity: baseIdentity,
      execute,
    }
    expect(createPiTools(options)).toEqual([])
    supportedTools.add('fixture.echo')
    expect(createPiTools(options).map((tool) => tool.name)).toEqual(['fixture.echo'])
  })
})
