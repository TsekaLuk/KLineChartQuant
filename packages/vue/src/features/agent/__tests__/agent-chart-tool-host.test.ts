import { RENDERER_TOOL_PROTOCOL_VERSION } from '@363045841yyt/klinechart-ai-runtime'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import {
  useAgentChartToolHost,
  type AgentChartToolMessageHandler,
  type AgentChartToolRegistrar,
} from '../use-agent-chart-tool-host'

const electronTarget = { windowId: '1', chartId: 'primary', hostGeneration: 1 }

function capabilities(target: typeof electronTarget) {
  return {
    protocolVersion: RENDERER_TOOL_PROTOCOL_VERSION,
    requestId: `capabilities-${target.hostGeneration}`,
    target,
    kind: 'host.capabilities' as const,
  }
}

describe('useAgentChartToolHost', () => {
  it('creates the browser host directly and fails closed while its Controller is unavailable', async () => {
    const scope = effectScope()
    const handle = scope.run(() => useAgentChartToolHost(ref({ getController: () => null })))!

    await expect(handle.request(capabilities(handle.webTarget))).resolves.toMatchObject({
      kind: 'tool.error',
      target: handle.webTarget,
      error: { code: 'TARGET_GONE' },
    })
    scope.stop()
  })

  it('registers once, replaces host generations, and rejects stale target envelopes', async () => {
    let handler: AgentChartToolMessageHandler | undefined
    const unregister = vi.fn<() => void>()
    const registrar: AgentChartToolRegistrar = {
      registerChartToolHost(next) {
        handler = next
        return unregister
      },
    }
    const scope = effectScope()
    scope.run(() => useAgentChartToolHost(ref({ getController: () => null }), registrar))

    await expect(handler!(capabilities(electronTarget), electronTarget)).resolves.toMatchObject({
      target: electronTarget,
      error: { code: 'TARGET_GONE' },
    })
    const replacement = { ...electronTarget, hostGeneration: 2 }
    await expect(handler!(capabilities(electronTarget), replacement)).resolves.toMatchObject({
      target: replacement,
      error: { code: 'TARGET_MISMATCH' },
    })
    await expect(handler!(capabilities(replacement), replacement)).resolves.toMatchObject({
      target: replacement,
      error: { code: 'TARGET_GONE' },
    })

    scope.stop()
    expect(unregister).toHaveBeenCalledOnce()
  })
})
