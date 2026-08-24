import {
  createChartToolHost,
  createRendererToolHostEndpoint,
  rendererTargetsEqual,
  type RendererToolResponse,
  type RendererToolTarget,
} from '@363045841yyt/klinechart-ai-runtime'
import { onScopeDispose } from 'vue'

import type { ChartController } from '@363045841yyt/klinechart-core'

export interface AgentChartControllerHandle {
  getController(): ChartController | null | undefined
}

export type AgentChartToolMessageHandler = (
  message: unknown,
  target: RendererToolTarget,
) => Promise<RendererToolResponse | undefined>

export interface AgentChartToolRegistrar {
  registerChartToolHost(handler: AgentChartToolMessageHandler): () => void
}

export interface AgentChartToolHostHandle {
  readonly webTarget: RendererToolTarget
  request(message: unknown, target?: RendererToolTarget): Promise<RendererToolResponse | undefined>
}

const WEB_TARGET: RendererToolTarget = {
  windowId: 'web',
  chartId: 'primary',
  hostGeneration: 0,
}

/** Owns the one shared browser/Renderer chart host for a Vue KlineChart ref. */
export function useAgentChartToolHost(
  chart: Readonly<{ value: AgentChartControllerHandle | null }>,
  registrar?: AgentChartToolRegistrar,
): AgentChartToolHostHandle {
  let endpoint: ReturnType<typeof createRendererToolHostEndpoint> | undefined

  const request: AgentChartToolHostHandle['request'] = (message, target = WEB_TARGET) => {
    if (!endpoint || !rendererTargetsEqual(endpoint.target, target)) {
      endpoint?.dispose()
      endpoint = createRendererToolHostEndpoint({
        target,
        host: createChartToolHost({ getController: () => chart.value?.getController() }),
      })
    }
    return endpoint.handle(message)
  }

  const unregister = registrar?.registerChartToolHost(request)
  onScopeDispose(() => {
    unregister?.()
    endpoint?.dispose()
    endpoint = undefined
  })

  return { webTarget: WEB_TARGET, request }
}
