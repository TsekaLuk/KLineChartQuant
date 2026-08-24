import { describe, expect, it } from 'vitest'

import {
  MAX_RENDERER_TOOL_MESSAGE_BYTES,
  RENDERER_TOOL_PROTOCOL_VERSION,
  parseRendererToolMessage,
} from '../rendererProtocol'

const target = { windowId: 'window-1', chartId: 'chart-1', hostGeneration: 2 }
const message = {
  protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
  requestId: 'request-1',
  target,
  kind: 'tool.execute' as const,
  identity: {
    requestId: 'request-1',
    sessionId: 'session-1',
    runId: 'run-1',
    turnId: 'turn-1',
    toolCallId: 'call-1',
  },
  toolName: 'chart.setTheme',
  toolVersion: '1.0.0',
  input: { theme: 'dark' },
  expectedChartRevision: 3,
}

describe('Renderer tool protocol', () => {
  it('parses a strict versioned execute request', () => {
    expect(parseRendererToolMessage(message, { expectedTarget: target })).toEqual({
      ok: true,
      value: message,
    })
  })

  it('rejects unknown fields and protocol versions', () => {
    expect(parseRendererToolMessage({ ...message, extra: true })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    })
    expect(parseRendererToolMessage({ ...message, protocolVersion: 99 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PROTOCOL' },
    })
  })

  it('rejects oversized and mismatched-target messages before dispatch', () => {
    expect(
      parseRendererToolMessage(
        { ...message, input: { value: 'x'.repeat(1_000) } },
        { maxBytes: 32 },
      ),
    ).toMatchObject({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE' } })
    expect(
      parseRendererToolMessage(message, {
        expectedTarget: { ...target, chartId: 'other-chart' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'TARGET_MISMATCH' } })
  })

  it('accepts cancellation and enforces the global payload bound', () => {
    const cancel = {
      protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
      requestId: 'cancel-envelope',
      target,
      kind: 'tool.cancel' as const,
      cancelRequestId: 'request-1',
    }
    expect(parseRendererToolMessage(cancel)).toMatchObject({ ok: true })
    expect(MAX_RENDERER_TOOL_MESSAGE_BYTES).toBe(512 * 1024)
  })
})
