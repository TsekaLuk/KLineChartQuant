// 验证宿主托管 Provider：默认生效、只读、不落盘，且用户仍可添加自己的 Provider。

import { ReadOnlyProviderCredentialStore } from '@363045841yyt/klinechart-agent-runtime'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserManagedProvider } from '../browser-agent/provider/types'
import {
  createAgentProviderSettingsPinia,
  useAgentProviderSettingsStore,
} from '../browser-agent/provider-settings/impl/agent-provider-settings-store'
import {
  readStoredAgentModelSettings,
  storedAgentModelSettingsJson,
} from './_agentSettingsFixtures'
import { BrowserAgentBridge } from './browser-agent-fixture'

const MANAGED_NAME = 'Managed'
const MANAGED_BASE_URL = 'https://host.example/ai/v1'
const MANAGED_MODEL = 'auto'
const MANAGED_CREDENTIAL = 'host-placeholder'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 返回一次流式聊天补全响应。 */
function chatCompletion(): Response {
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'chat-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: MANAGED_MODEL,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n`
  return new Response(
    [
      chunk({ role: 'assistant', content: '托管回答' }, null),
      chunk({}, 'stop'),
      'data: [DONE]\n',
    ].join('\n'),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

/** 构造托管 Provider 配置与可断言的 fetch。 */
function managedProvider() {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => chatCompletion(),
  )
  const config: BrowserManagedProvider = {
    name: MANAGED_NAME,
    baseUrl: `${MANAGED_BASE_URL}/`,
    model: { id: MANAGED_MODEL, name: 'Auto', contextWindow: 128_000 },
    credentials: new ReadOnlyProviderCredentialStore(MANAGED_CREDENTIAL),
    fetch,
  }
  return { config, fetch }
}

function bridgeWith(config: BrowserManagedProvider = managedProvider().config) {
  return new BrowserAgentBridge({ managedProvider: config })
}

describe('BrowserAgentBridge managed provider', () => {
  it('selects the managed provider by default and reports it as connected', async () => {
    const bridge = bridgeWith()

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'connected',
      configured: true,
      managed: true,
      profileName: MANAGED_NAME,
      baseUrl: MANAGED_BASE_URL,
      modelId: MANAGED_MODEL,
      modelLabel: 'Auto',
      contextWindow: 128_000,
      reasoningEfforts: [],
    })
    await expect(bridge.getProviderStatus()).resolves.not.toHaveProperty(
      'fingerprint',
      expect.any(String),
    )
    await expect(bridge.listProviderProfiles()).resolves.toEqual([
      expect.objectContaining({ name: MANAGED_NAME, managed: true, modelId: MANAGED_MODEL }),
    ])
    await expect(bridge.listProviderModelPool()).resolves.toEqual([
      expect.objectContaining({ id: MANAGED_MODEL, provider: MANAGED_NAME }),
    ])
    await expect(bridge.listProviderModelCatalog()).resolves.toMatchObject({
      models: [{ id: MANAGED_MODEL }],
    })
  })

  it('never persists the managed provider or its credential', async () => {
    const bridge = bridgeWith()
    await bridge.createProviderProfile('Own provider')
    await bridge.selectProviderProfile(MANAGED_NAME)

    expect(storedAgentModelSettingsJson()).not.toContain(MANAGED_NAME)
    expect(storedAgentModelSettingsJson()).not.toContain(MANAGED_CREDENTIAL)
    expect(readStoredAgentModelSettings()).toMatchObject({
      profiles: [{ name: 'Own provider', active: false }],
    })
  })

  it('sends runs through the managed fetch with the placeholder credential', async () => {
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)
    const { config, fetch } = managedProvider()
    const bridge = bridgeWith(config)
    const [session] = await bridge.listSessions()
    const completed = new Promise<void>((resolve) => {
      const unsubscribe = bridge.subscribe((event) => {
        if (event.type !== 'session.snapshot') return
        if (event.snapshot.runs.at(-1)?.status !== 'completed') return
        unsubscribe()
        resolve()
      })
    })

    await bridge.startRun({ sessionId: session!.id, prompt: 'Hello', readOnly: true })
    await completed

    expect(globalFetch).not.toHaveBeenCalled()
    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe(`${MANAGED_BASE_URL}/chat/completions`)
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: MANAGED_MODEL })
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${MANAGED_CREDENTIAL}`)
    expect(new Headers(init?.headers).has('x-stainless-os')).toBe(false)
  })

  it('lets the user add their own provider and return to the managed one', async () => {
    const bridge = bridgeWith()
    await bridge.createProviderProfile('Own provider')

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      state: 'not-configured',
      profileName: 'Own provider',
    })
    await expect(bridge.getProviderStatus()).resolves.not.toHaveProperty('managed', true)
    await bridge.saveProvider({
      baseUrl: 'https://own.example/v1',
      apiKey: 'sk-own',
      protocol: 'openai-completions',
      profileName: 'Own provider',
    })
    await expect(bridge.listProviderProfiles()).resolves.toEqual([
      expect.objectContaining({ name: MANAGED_NAME, managed: true }),
      expect.objectContaining({ name: 'Own provider', baseUrl: 'https://own.example/v1' }),
    ])

    await bridge.selectProviderProfile(MANAGED_NAME)
    await expect(bridge.getProviderStatus()).resolves.toMatchObject({
      managed: true,
      baseUrl: MANAGED_BASE_URL,
    })
    expect(storedAgentModelSettingsJson()).toContain('sk-own')
    expect(storedAgentModelSettingsJson()).not.toContain(MANAGED_CREDENTIAL)
  })

  it('does not carry the managed credential into a newly saved user provider', async () => {
    const bridge = bridgeWith()

    await bridge.saveProvider({
      baseUrl: 'https://own.example/v1',
      protocol: 'openai-completions',
      profileName: 'Own provider',
    })

    expect(storedAgentModelSettingsJson()).not.toContain(MANAGED_CREDENTIAL)
  })

  it('falls back to the managed provider when the active user provider is deleted', async () => {
    const bridge = bridgeWith()
    await bridge.createProviderProfile('Own provider')

    await bridge.deleteProviderProfile('Own provider')

    await expect(bridge.getProviderStatus()).resolves.toMatchObject({ managed: true })
  })

  it('keeps a previously chosen user provider active', async () => {
    const first = bridgeWith()
    await first.createProviderProfile('Own provider')

    await expect(bridgeWith().getProviderStatus()).resolves.toMatchObject({
      profileName: 'Own provider',
    })
  })

  it('rejects every edit of the managed provider', async () => {
    const bridge = bridgeWith()

    await expect(bridge.setProviderModel('other')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    await expect(
      bridge.addProviderModelPoolModel({ id: 'x', name: 'X', compatibility: 'compatible' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    await expect(bridge.removeProviderModelPoolModel(MANAGED_MODEL)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
    await expect(bridge.setProviderReasoningEffort(undefined)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
    await expect(bridge.deleteProviderCredential()).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
    await expect(
      bridge.testProvider({
        baseUrl: 'https://own.example/v1',
        protocol: 'openai-completions',
        model: 'x',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    await expect(bridge.deleteProviderProfile(MANAGED_NAME)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
    await expect(bridge.renameProviderProfile(MANAGED_NAME, 'Renamed')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
    await expect(bridge.createProviderProfile(MANAGED_NAME)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
    await expect(
      bridge.saveProvider({
        baseUrl: 'https://own.example/v1',
        protocol: 'openai-completions',
        profileName: MANAGED_NAME,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('rejects a managed provider without a model id', () => {
    const { config } = managedProvider()

    expect(() => bridgeWith({ ...config, model: { id: ' ' } })).toThrowError(/model id/)
  })

  it('keeps the settings store from persisting a connection for the managed profile', async () => {
    setActivePinia(createAgentProviderSettingsPinia())
    const bridge = bridgeWith()
    const saveProvider = vi.spyOn(bridge, 'saveProvider')
    const store = useAgentProviderSettingsStore()
    store.bindBridge(bridge)

    await store.show(await bridge.getProviderStatus())
    store.baseUrl = 'https://edited.example/v1'

    expect(store.profileName).toBe(MANAGED_NAME)
    await expect(store.persistConnection()).resolves.toBe(false)
    expect(saveProvider).not.toHaveBeenCalled()
  })
})
