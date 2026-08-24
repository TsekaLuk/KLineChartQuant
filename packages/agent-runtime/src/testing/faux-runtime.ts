import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { Type } from 'typebox'

import { AgentRuntimeError } from '../contracts/errors.js'

import type { AgentApplicationServiceOptions } from '../application/types.js'
import type { RuntimeSupport } from '../application/unavailable-runtime.js'
import type {
  ProviderModelsInput,
  ProviderModelsResult,
  ProviderStatusView,
  ProviderTestInput,
  ProviderTestResult,
} from '../contracts/ui.js'
import type { PiRunPlan, RuntimeToolDefinition } from '../pi/types.js'

export function createFauxRuntimeSupport(): RuntimeSupport {
  let configured = false
  let modelLabel = 'KQ Faux Fast'

  const provider = {
    getStatus(): ProviderStatusView {
      return configured
        ? {
            state: 'connected',
            providerLabel: '302.ai',
            configured: true,
            baseUrl: 'https://api.302.ai/v1',
            modelId: modelLabel,
            modelLabel,
            persistenceMode: 'encrypted',
            compatibility: 'compatible',
          }
        : {
            state: 'not-configured',
            providerLabel: '302.ai',
            configured: false,
            baseUrl: 'https://api.302.ai/v1',
            persistenceMode: 'encrypted',
            compatibility: 'unknown',
          }
    },
    async listModels(_input: ProviderModelsInput): Promise<ProviderModelsResult> {
      return {
        models: [{ id: modelLabel, name: modelLabel, compatibility: 'compatible', latencyMs: 1 }],
        refreshedAt: Date.now(),
      }
    },
    async test(input: ProviderTestInput): Promise<ProviderTestResult> {
      configured = true
      modelLabel = input.model
      return {
        compatible: true,
        model: input.model,
        latencyMs: 1,
        ttftMs: 1,
        stages: [
          { stage: 'catalog', ok: true, latencyMs: 1 },
          { stage: 'text', ok: true, latencyMs: 1, ttftMs: 1 },
          { stage: 'tool', ok: true, latencyMs: 1 },
        ],
      }
    },
    async deleteCredential(): Promise<void> {
      configured = false
    },
  }

  const createPlan = (
    context: Parameters<AgentApplicationServiceOptions['createPlan']>[0],
  ): PiRunPlan => {
    if (!configured) {
      throw new AgentRuntimeError(
        'PROVIDER_NOT_CONFIGURED',
        'Configure an Agent Provider before starting a run.',
      )
    }
    const mutation = !context.readOnly && /add|switch|clear|delete|move|theme/i.test(context.prompt)
    const toolName = mutation ? 'chart.setTheme' : 'chart.getContext'
    const toolInput = mutation
      ? { theme: /light|浅色/i.test(context.prompt) ? 'light' : 'dark' }
      : {}
    const faux = fauxProvider({
      tokensPerSecond: mutation ? 18 : 10_000,
      tokenSize: { min: 1, max: 1 },
    })
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall(toolName, toolInput, { id: 'scripted-tool-call' }), {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage(
        mutation
          ? 'The deterministic E2E Provider requested a canonical chart theme change. '.repeat(6)
          : 'The deterministic E2E Provider requested the live visible chart context.',
      ),
    ])
    const models = createModels()
    models.setProvider(faux.provider)
    const tool: RuntimeToolDefinition = {
      name: toolName,
      label: mutation ? 'Set chart theme' : 'Get chart context',
      description: mutation ? 'Set the chart theme.' : 'Read the live chart context.',
      parameters: mutation
        ? Type.Object({ theme: Type.Union([Type.Literal('light'), Type.Literal('dark')]) })
        : Type.Object({}),
      safety: mutation ? 'reversible-write' : 'read-only',
      reversible: mutation,
      executionMode: mutation ? 'sequential' : 'parallel',
      summarizeInput: () => (mutation ? 'Set theme to dark' : 'Read chart context'),
      execute: async (_input, toolContext) => {
        toolContext.signal.throwIfAborted()
        toolContext.progress({ label: 'Validating chart scope', current: 1, total: 1 })
        return {
          content: mutation ? 'Theme changed.' : 'Chart context returned.',
          summary: mutation ? 'Chart theme changed.' : 'Chart context inspected.',
          undoToken: mutation ? `undo:${context.runId}` : undefined,
          evidence: {
            symbol: 'BTCUSDT',
            period: '1h',
            source: 'Electron faux runtime',
            timezone: 'UTC',
          },
        }
      },
    }
    return {
      sessionId: context.sessionId,
      runId: context.runId,
      turnId: context.turnId,
      prompt: context.prompt,
      readOnly: context.readOnly,
      scope: {
        symbol: 'BTCUSDT',
        period: '1h',
        visibleRange: 'Latest 7 days',
        readOnly: context.readOnly,
      },
      tools: [tool],
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
    }
  }

  return { provider, createPlan }
}
