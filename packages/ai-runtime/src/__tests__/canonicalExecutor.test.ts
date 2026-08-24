import { Type } from 'typebox'
import { describe, expect, it, vi } from 'vitest'

import {
  createToolRegistry,
  defineTool,
  executeToolAsync,
  type ToolExecutionIdentity,
  type ToolHostExecutor,
  type ToolPolicyEvaluator,
} from '../canonicalExecutor'

import type { ToolDefinition } from '../toolRegistry'

const strict = { additionalProperties: false } as const
const identity: ToolExecutionIdentity = {
  requestId: 'request-1',
  sessionId: 'session-1',
  runId: 'run-1',
  turnId: 'turn-1',
  toolCallId: 'call-1',
}

function fixtureDefinition(overrides: Partial<Parameters<typeof defineTool>[0]> = {}) {
  return defineTool({
    name: 'fixture.echo',
    version: '1.0.0',
    title: 'Echo',
    description: 'Echo a strictly validated fixture value for executor testing.',
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
    ...overrides,
  })
}

function fixtureRegistry(overrides: Partial<Parameters<typeof defineTool>[0]> = {}) {
  return createToolRegistry('1.0.0', [fixtureDefinition(overrides)])
}

describe('executeToolAsync', () => {
  it('rejects an unknown tool before invoking the host', async () => {
    const execute = vi.fn<ToolHostExecutor>()
    const result = await executeToolAsync({ name: 'fixture.unknown', input: {} }, identity, {
      registry: fixtureRegistry(),
      capabilityContext: { audience: 'first-party' },
      execute,
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_TOOL', retryable: false },
      meta: { toolVersion: 'unknown', registryVersion: '1.0.0' },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns a validated domain result with stable trace metadata', async () => {
    const execute = vi.fn<ToolHostExecutor>(async (_name, input) => ({
      ok: true,
      data: input,
    }))
    const result = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'RSI' } },
      identity,
      {
        registry: fixtureRegistry(),
        capabilityContext: { audience: 'first-party' },
        execute,
        now: (() => {
          let value = 100
          return () => value++
        })(),
      },
    )

    expect(result).toMatchObject({
      ok: true,
      data: { value: 'RSI' },
      meta: {
        ...identity,
        toolVersion: '1.0.0',
        registryVersion: '1.0.0',
        durationMs: 1,
      },
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('rejects invalid input before policy or host execution', async () => {
    const policy = vi.fn<ToolPolicyEvaluator>(async () => ({ allowed: true }))
    const execute = vi.fn<ToolHostExecutor>(async () => ({
      ok: true,
      data: { value: 'no' },
    }))
    const result = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 14 } },
      identity,
      {
        registry: fixtureRegistry(),
        capabilityContext: { audience: 'first-party' },
        policy,
        execute,
      },
    )
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENTS', retryable: false },
    })
    expect(policy).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns capability, policy, and confirmation failures as typed errors', async () => {
    const execute = vi.fn<ToolHostExecutor>(async () => ({
      ok: true,
      data: { value: 'no' },
    }))
    const unavailable = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry(),
        capabilityContext: { audience: 'first-party', supportedTools: new Set() },
        execute,
      },
    )
    expect(unavailable).toMatchObject({
      ok: false,
      error: { code: 'TOOL_UNAVAILABLE', retryable: false },
    })

    const codes = ['POLICY_DENIED', 'CONFIRMATION_REQUIRED'] as const
    const deniedResults = await Promise.all(
      codes.map((code) =>
        executeToolAsync({ name: 'fixture.echo', input: { value: 'x' } }, identity, {
          registry: fixtureRegistry(),
          capabilityContext: { audience: 'first-party' },
          policy: async () => ({
            allowed: false,
            error: { code, message: code, retryable: false },
          }),
          execute,
        }),
      ),
    )
    expect(deniedResults).toEqual([
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: codes[0] }) }),
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: codes[1] }) }),
    ])
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects invalid successful output before postcondition verification', async () => {
    const postcondition = vi.fn<NonNullable<ToolDefinition['verifyPostcondition']>>(async () => ({
      ok: true,
    }))
    const result = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry({ verifyPostcondition: postcondition }),
        capabilityContext: { audience: 'first-party' },
        execute: async () => ({ ok: true, data: { wrong: true } }),
      },
    )
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TOOL_OUTPUT', retryable: false },
    })
    expect(postcondition).not.toHaveBeenCalled()
  })

  it('runs live host verification after output validation and before definition verification', async () => {
    const order: string[] = []
    const result = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry({
          verifyPostcondition: async () => {
            order.push('definition-verify')
            return { ok: true }
          },
        }),
        capabilityContext: { audience: 'first-party' },
        execute: async () => {
          order.push('host')
          return { ok: true, data: { value: 'x' } }
        },
        verify: async () => {
          order.push('live-verify')
          return { ok: true }
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(order).toEqual(['host', 'live-verify', 'definition-verify'])
  })

  it('maps failed postconditions and preserves host metadata on success', async () => {
    const failed = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry({
          verifyPostcondition: async () => ({
            ok: false,
            error: { message: 'State did not change.', retryable: true },
          }),
        }),
        capabilityContext: { audience: 'first-party' },
        execute: async () => ({ ok: true, data: { value: 'x' } }),
      },
    )
    expect(failed).toMatchObject({
      ok: false,
      error: { code: 'POSTCONDITION_FAILED', retryable: true },
    })

    const succeeded = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry(),
        capabilityContext: { audience: 'first-party' },
        execute: async () => ({
          ok: true,
          data: { value: 'x' },
          content: 'x',
          meta: { chartRevisionBefore: 2, chartRevisionAfter: 3, undoToken: 'undo-1' },
        }),
      },
    )
    expect(succeeded).toMatchObject({
      ok: true,
      content: 'x',
      meta: { chartRevisionBefore: 2, chartRevisionAfter: 3, undoToken: 'undo-1' },
    })
  })

  it('distinguishes timeout from caller cancellation and aborts the host signal', async () => {
    let timedOutSignal: AbortSignal | undefined
    const timedOut = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry({
          policy: {
            safety: 'read-only',
            confirmation: 'never',
            reversible: false,
            execution: 'parallel',
            timeoutMs: 5,
            syncCompatible: false,
          },
        }),
        capabilityContext: { audience: 'first-party' },
        execute: async (_name, _input, _context, signal) => {
          timedOutSignal = signal
          return new Promise(() => undefined)
        },
      },
    )
    expect(timedOut).toMatchObject({ ok: false, error: { code: 'TIMEOUT', retryable: true } })
    expect(timedOutSignal?.aborted).toBe(true)

    const execute = vi.fn<ToolHostExecutor>(async () => ({
      ok: true,
      data: { value: 'x' },
    }))
    const controller = new AbortController()
    controller.abort()
    const cancelled = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry(),
        capabilityContext: { audience: 'first-party' },
        signal: controller.signal,
        execute,
      },
    )
    expect(cancelled).toMatchObject({
      ok: false,
      error: { code: 'CANCELLED', retryable: true },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('normalizes thrown policy, host, and postcondition errors without leaking details', async () => {
    const policyFailure = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry(),
        capabilityContext: { audience: 'first-party' },
        policy: async () => {
          throw new Error('Bearer secret-policy-value')
        },
        execute: async () => ({ ok: true, data: { value: 'x' } }),
      },
    )
    expect(policyFailure).toMatchObject({
      ok: false,
      error: { code: 'POLICY_EVALUATION_FAILED', retryable: false },
    })

    const hostFailure = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry(),
        capabilityContext: { audience: 'first-party' },
        execute: async () => {
          throw new Error('Bearer secret-host-value')
        },
      },
    )
    expect(hostFailure).toMatchObject({
      ok: false,
      error: { code: 'TOOL_EXECUTION_FAILED', retryable: true },
    })

    const postconditionFailure = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry({
          verifyPostcondition: async () => {
            throw new Error('Bearer secret-postcondition-value')
          },
        }),
        capabilityContext: { audience: 'first-party' },
        execute: async () => ({ ok: true, data: { value: 'x' } }),
      },
    )
    expect(postconditionFailure).toMatchObject({
      ok: false,
      error: { code: 'POSTCONDITION_FAILED', retryable: true },
    })
    expect(JSON.stringify([policyFailure, hostFailure, postconditionFailure])).not.toContain(
      'secret-',
    )
  })

  it('applies the tool timeout to postcondition verification', async () => {
    const result = await executeToolAsync(
      { name: 'fixture.echo', input: { value: 'x' } },
      identity,
      {
        registry: fixtureRegistry({
          policy: {
            safety: 'read-only',
            confirmation: 'never',
            reversible: false,
            execution: 'parallel',
            timeoutMs: 5,
            syncCompatible: false,
          },
          verifyPostcondition: async () => new Promise(() => undefined),
        }),
        capabilityContext: { audience: 'first-party' },
        execute: async () => ({ ok: true, data: { value: 'x' } }),
      },
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'TIMEOUT', retryable: true } })
  })
})
