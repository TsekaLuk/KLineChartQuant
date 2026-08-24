import { describe, expect, it, vi } from 'vitest'

import {
  AgentRuntimeError,
  InMemoryProviderCredentialStore,
  InMemoryProviderSettingsStore,
  PiRunDriver,
  create302AiRuntimeSupport,
  matchProviderPresetId,
  normalize302AiBaseUrl,
  parseProvider302AiSettings,
  parseRetryAfter,
  providerLabelForBaseUrl,
  readLiveProviderEnv,
  requestProviderJson,
  type Provider302AiSettings,
} from '../index'

import type { FetchFunction } from '@earendil-works/pi-ai'

const secret = 'temporary-provider-credential'
const baseUrl = 'https://api.302.ai/v1'

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function configuredStores() {
  const credentials = new InMemoryProviderCredentialStore({ persistenceMode: 'encrypted' })
  const settings = new InMemoryProviderSettingsStore()
  return { credentials, settings }
}

function providerFetch(options: { invalidTool?: boolean } = {}): FetchFunction {
  return vi.fn(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/models')) {
      return json({ object: 'list', data: [{ id: 'frontier-fast', name: 'Frontier Fast' }] })
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (Array.isArray(body.tools)) {
      const tool = body.tools[0] as {
        function: {
          name: string
          parameters: { properties: { nonce: { const: string } } }
        }
      }
      return json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'probe-1',
                  type: 'function',
                  function: {
                    name: options.invalidTool ? 'wrong_tool' : tool.function.name,
                    arguments: JSON.stringify({
                      nonce: tool.function.parameters.properties.nonce.const,
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
    }
    return json({ choices: [{ message: { role: 'assistant', content: 'OK' } }] })
  })
}

async function configure(
  credentials: InMemoryProviderCredentialStore,
  settings: InMemoryProviderSettingsStore,
): Promise<void> {
  await credentials.write(secret)
  await settings.write({
    version: 1,
    baseUrl,
    modelId: 'frontier-fast',
    modelName: 'Frontier Fast',
    compatibility: 'compatible',
    lastTestedAt: 10,
    lastModelsRefreshAt: 9,
  })
}

describe('OpenAI-compatible presets and live env', () => {
  it('matches official URLs and aliases without treating 302.ai as the default', () => {
    expect(matchProviderPresetId('')).toBe('custom')
    expect(matchProviderPresetId('https://api.deepseek.com/v1')).toBe('deepseek')
    expect(matchProviderPresetId('https://api.groq.com/openai/v1')).toBe('groq')
    expect(matchProviderPresetId('https://api.302.ai/v1')).toBe('302ai')
    expect(providerLabelForBaseUrl(undefined)).toBe('OpenAI-compatible')
    expect(providerLabelForBaseUrl('https://api.302.ai/v1')).toBe('302.ai')
  })

  it('prefers the vendor-neutral live key and accepts the deprecated alias', () => {
    expect(readLiveProviderEnv({ KQ_LLM_API_KEY: 'new', KQ_302AI_API_KEY: 'old' }).apiKey).toBe(
      'new',
    )
    expect(readLiveProviderEnv({ KQ_302AI_API_KEY: 'old' }).apiKey).toBe('old')
    expect(readLiveProviderEnv({}).apiKey).toBeUndefined()
  })
})

describe('302.ai Provider HTTP boundary', () => {
  it('normalizes valid endpoints and rejects credentials, queries, and non-HTTP URLs', () => {
    expect(normalize302AiBaseUrl('https://api.302.ai/v1///')).toBe(baseUrl)
    expect(() => normalize302AiBaseUrl('file:///tmp/provider')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
    expect(() => normalize302AiBaseUrl('https://user:pass@example.test/v1')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
    expect(() => normalize302AiBaseUrl('https://example.test/v1?key=value')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
  })

  it('parses delta-seconds and HTTP-date Retry-After values', () => {
    expect(parseRetryAfter('2', 1_000)).toBe(2_000)
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:03 GMT', 1_000)).toBe(2_000)
    expect(parseRetryAfter('not-a-date', 1_000)).toBeUndefined()
  })

  it.each([
    [401, 'PROVIDER_AUTHENTICATION'],
    [403, 'PROVIDER_PERMISSION'],
    [404, 'PROVIDER_MODEL_NOT_FOUND'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %i to %s without consuming the response body', async (status, code) => {
    const response = new Response(secret, { status })
    const fetch = vi.fn(async () => response)
    await expect(
      requestProviderJson(
        'https://example.test',
        {},
        {
          fetch,
          now: () => 0,
          sleep: async () => undefined,
          maxRetries: 0,
        },
      ),
    ).rejects.toMatchObject({ code })
    expect(response.bodyUsed).toBe(false)
  })

  it('respects Retry-After before a bounded retry', async () => {
    const fetch = vi
      .fn<FetchFunction>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(json({ ok: true }))
    const sleep = vi.fn(async () => undefined)
    const result = await requestProviderJson(
      'https://example.test',
      {},
      {
        fetch,
        now: () => 1_000,
        sleep,
        maxRetries: 1,
      },
    )
    expect(result.value).toEqual({ ok: true })
    expect(sleep).toHaveBeenCalledWith(2_000, undefined)
  })

  it('maps request timeout and malformed JSON without relaying upstream data', async () => {
    const hanging: FetchFunction = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    await expect(
      requestProviderJson(
        'https://example.test',
        {},
        {
          fetch: hanging,
          now: Date.now,
          sleep: async () => undefined,
          timeoutMs: 5,
        },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' })

    await expect(
      requestProviderJson(
        'https://example.test',
        {},
        {
          fetch: async () => new Response(`{"secret":"${secret}"`, { status: 200 }),
          now: Date.now,
          sleep: async () => undefined,
        },
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MALFORMED_RESPONSE',
      message: 'The provider returned malformed JSON.',
    })
  })
})

describe('302.ai runtime support', () => {
  it('starts unconfigured without inventing a vendor Base URL', async () => {
    const { credentials, settings } = configuredStores()
    const support = create302AiRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
    })
    const status = await support.provider.getStatus()
    expect(status).toMatchObject({
      state: 'not-configured',
      configured: false,
      providerLabel: 'OpenAI-compatible',
    })
    expect(status.baseUrl).toBeUndefined()
  })

  it('discovers models, passes all probes, and persists only the successful configuration', async () => {
    const { credentials, settings } = configuredStores()
    let currentTime = 100
    const support = create302AiRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
      now: () => ++currentTime,
      sleep: async () => undefined,
    })

    const discovered = await support.provider.listModels({ baseUrl, apiKey: secret })
    expect(discovered.models).toEqual([
      { id: 'frontier-fast', name: 'Frontier Fast', compatibility: 'unknown' },
    ])
    const result = await support.provider.test({ baseUrl, apiKey: secret, model: 'frontier-fast' })
    expect(result).toMatchObject({
      compatible: true,
      model: 'frontier-fast',
      stages: [
        { stage: 'catalog', ok: true },
        { stage: 'text', ok: true },
        { stage: 'tool', ok: true },
      ],
    })
    expect(await credentials.read()).toBe(secret)
    expect(await settings.read()).toMatchObject<Partial<Provider302AiSettings>>({
      baseUrl,
      modelId: 'frontier-fast',
      compatibility: 'compatible',
    })
    const status = await support.provider.getStatus()
    expect(status).toMatchObject({
      state: 'connected',
      configured: true,
      persistenceMode: 'encrypted',
      compatibility: 'compatible',
      modelId: 'frontier-fast',
    })
    expect(JSON.stringify(status)).not.toContain(secret)
    expect(status.fingerprint).toMatch(/^sha256:[0-9a-f]{12}$/)
  })

  it('does not replace a last-known-good credential when the tool probe fails', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = create302AiRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch({ invalidTool: true }),
      sleep: async () => undefined,
    })

    await expect(
      support.provider.test({ baseUrl, apiKey: 'replacement-credential', model: 'frontier-fast' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_INCOMPATIBLE_TOOLS' })
    expect(await credentials.read()).toBe(secret)
    expect(await settings.read()).toMatchObject({ modelId: 'frontier-fast' })
    const status = await support.provider.getStatus()
    expect(status.state).toBe('error')
    expect(JSON.stringify(status)).not.toContain('replacement-credential')
  })

  it('deletes only the credential and blocks subsequent runs before network access', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const fetch = providerFetch()
    const support = create302AiRuntimeSupport({ credentials, settings, fetch })
    await support.provider.deleteCredential()
    await expect(
      support.createPlan({
        sessionId: 'session-1',
        runId: 'run-1',
        turnId: 'turn-1',
        lane: 'main',
        prompt: 'Hello',
        readOnly: true,
        startedAt: 1,
        userEntryId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()
    expect(await settings.read()).toMatchObject({ modelId: 'frontier-fast' })
  })

  it('streams real OpenAI-compatible SSE through Pi with no scripted tools', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const fetch = vi.fn<FetchFunction>(async () => {
      const stream = [
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"frontier-fast","choices":[{"index":0,"delta":{"role":"assistant","content":"Real "},"finish_reason":null}]}',
        '',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"frontier-fast","choices":[{"index":0,"delta":{"content":"response"},"finish_reason":null}]}',
        '',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"frontier-fast","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    })
    const support = create302AiRuntimeSupport({ credentials, settings, fetch })
    const plan = await support.createPlan({
      sessionId: 'session-1',
      runId: 'run-1',
      turnId: 'turn-1',
      lane: 'main',
      prompt: 'Say hello',
      readOnly: true,
      startedAt: 1,
      userEntryId: 'user-1',
    })
    const deltas: string[] = []
    const result = await new PiRunDriver().run(plan, (event) => {
      if (event.type === 'assistant.text.delta') deltas.push(event.delta)
    })
    expect(plan.tools).toEqual([])
    expect(result.text).toBe('Real response')
    expect(deltas.join('')).toBe('Real response')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('projects streamed HTTP failures to stable errors without raw bodies', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = create302AiRuntimeSupport({
      credentials,
      settings,
      fetch: async () => new Response(secret, { status: 401 }),
      maxRetries: 0,
    })
    const plan = await support.createPlan({
      sessionId: 'session-1',
      runId: 'run-1',
      turnId: 'turn-1',
      lane: 'main',
      prompt: 'Hello',
      readOnly: true,
      startedAt: 1,
      userEntryId: 'user-1',
    })
    await expect(new PiRunDriver().run(plan, () => undefined)).rejects.toMatchObject({
      code: 'PROVIDER_AUTHENTICATION',
      message: 'The provider rejected the API credential.',
    })
  })

  it('returns a safe removable error status when persisted settings are corrupt', async () => {
    const credentials = new InMemoryProviderCredentialStore({ persistenceMode: 'encrypted' })
    await credentials.write(secret)
    const support = create302AiRuntimeSupport({
      credentials,
      settings: {
        read: async () => {
          throw new Error(`corrupt settings near ${secret}`)
        },
        write: async () => undefined,
      },
      fetch: providerFetch(),
    })
    const status = await support.provider.getStatus()
    expect(status).toMatchObject({
      state: 'error',
      configured: true,
      error: { code: 'PROVIDER_ERROR', message: 'The provider operation failed.' },
    })
    expect(JSON.stringify(status)).not.toContain(secret)
  })
})

describe('302.ai Provider malformed-response boundary', () => {
  function supportWith(catalogBody: unknown, completion?: unknown) {
    const { credentials, settings } = configuredStores()
    const fetch: FetchFunction = vi.fn(async (input) =>
      String(input).endsWith('/models') ? json(catalogBody) : json(completion ?? {}),
    )
    return {
      credentials,
      settings,
      support: create302AiRuntimeSupport({ credentials, settings, fetch }),
    }
  }

  it.each([
    ['a non-object payload', 'catalog'],
    ['an object without a data array', { object: 'list' }],
    ['a data array with no usable model', { object: 'list', data: [{ id: '' }, { name: 'x' }] }],
  ])('rejects %s as a malformed catalog', async (_label, body) => {
    const { credentials, support } = supportWith(body)
    await credentials.write(secret)

    await expect(support.provider.listModels({ baseUrl })).rejects.toMatchObject({
      code: 'PROVIDER_MALFORMED_RESPONSE',
    })
  })

  it('requires a credential before contacting the catalog endpoint', async () => {
    const { support } = supportWith({ object: 'list', data: [{ id: 'fast' }] })

    await expect(support.provider.listModels({ baseUrl })).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
    })
  })

  it('falls back to the model id when the catalog omits a usable name', async () => {
    const { credentials, support } = supportWith({
      object: 'list',
      data: [{ id: 'beta', name: '   ' }, { id: 'alpha' }, { id: 'alpha', name: 'Alpha' }],
    })
    await credentials.write(secret)

    expect((await support.provider.listModels({ baseUrl })).models).toEqual([
      { id: 'alpha', name: 'Alpha', compatibility: 'unknown' },
      { id: 'beta', name: 'beta', compatibility: 'unknown' },
    ])
  })

  it.each([
    ['no choices array', {}],
    ['a choice without a message', { choices: [{}] }],
    ['blank assistant content', { choices: [{ message: { role: 'assistant', content: '  ' } }] }],
  ])('reports %s in the text probe as a malformed completion', async (_label, completion) => {
    const { credentials, support } = supportWith(
      { object: 'list', data: [{ id: 'frontier-fast', name: 'Frontier Fast' }] },
      completion,
    )
    await credentials.write(secret)

    await expect(support.provider.test({ baseUrl, model: 'frontier-fast' })).rejects.toMatchObject({
      code: 'PROVIDER_MALFORMED_RESPONSE',
    })
  })

  it.each([
    ['no tool_calls', { role: 'assistant', content: null }],
    [
      'unparsable tool arguments',
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ function: { name: 'kq_agent_probe', arguments: '{"nonce":' } }],
      },
    ],
    [
      'a mismatched nonce',
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { function: { name: 'kq_agent_probe', arguments: JSON.stringify({ nonce: 'wrong' }) } },
        ],
      },
    ],
  ])('marks a model incompatible when the tool probe returns %s', async (_label, message) => {
    const { credentials, settings } = configuredStores()
    await credentials.write(secret)
    const fetch: FetchFunction = vi.fn(async (input, init) => {
      if (String(input).endsWith('/models')) {
        return json({ object: 'list', data: [{ id: 'frontier-fast', name: 'Frontier Fast' }] })
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Array.isArray(body.tools)
        ? json({ choices: [{ message }] })
        : json({ choices: [{ message: { role: 'assistant', content: 'OK' } }] })
    })
    const support = create302AiRuntimeSupport({ credentials, settings, fetch })

    await expect(support.provider.test({ baseUrl, model: 'frontier-fast' })).rejects.toMatchObject({
      code: 'PROVIDER_INCOMPATIBLE_TOOLS',
    })
  })
})

describe('persisted Provider settings', () => {
  it('accepts an absent value and round-trips a complete record', () => {
    expect(parseProvider302AiSettings(undefined)).toBeUndefined()
    expect(parseProvider302AiSettings(valid())).toEqual(valid())
  })

  it('rejects every shape that would silently downgrade the saved Provider', () => {
    const invalid: unknown[] = [
      null,
      'settings',
      ['settings'],
      { ...valid(), version: 99 },
      { ...valid(), baseUrl: 1 },
      { ...valid(), modelId: undefined },
      { ...valid(), modelName: null },
      { ...valid(), compatibility: 'unknown' },
      { ...valid(), lastTestedAt: 'recent' },
      { ...valid(), lastTestedAt: Number.NaN },
      { ...valid(), lastModelsRefreshAt: '20' },
      { ...valid(), lastModelsRefreshAt: Number.POSITIVE_INFINITY },
    ]
    for (const value of invalid) {
      expect(() => parseProvider302AiSettings(value)).toThrowError(
        expect.objectContaining({ code: 'PROVIDER_ERROR' }),
      )
    }
  })

  it('drops unknown extra fields instead of persisting them', () => {
    expect(parseProvider302AiSettings({ ...valid(), injected: 'value' })).toEqual(valid())
  })
})

describe('in-memory Provider stores', () => {
  it('stores, reads, and deletes a credential while reporting its persistence mode', async () => {
    const credentials = new InMemoryProviderCredentialStore({ persistenceMode: 'memory-only' })

    expect(await credentials.read()).toBeUndefined()
    await credentials.write(secret)
    expect(await credentials.read()).toBe(secret)
    expect(await credentials.metadata()).toEqual({ persistenceMode: 'memory-only' })
    await credentials.delete()
    expect(await credentials.read()).toBeUndefined()
  })

  it('defaults to memory-only persistence', async () => {
    expect(await new InMemoryProviderCredentialStore().metadata()).toEqual({
      persistenceMode: 'memory-only',
    })
  })

  it('honours an aborted signal on every credential operation', async () => {
    const credentials = new InMemoryProviderCredentialStore()
    const controller = new AbortController()
    controller.abort()

    await expect(credentials.read(controller.signal)).rejects.toThrowError()
    await expect(credentials.write(secret, controller.signal)).rejects.toThrowError()
    await expect(credentials.delete(controller.signal)).rejects.toThrowError()
  })

  it('clones settings so callers cannot mutate stored state', async () => {
    const store = new InMemoryProviderSettingsStore()
    const settings = valid()

    expect(await store.read()).toBeUndefined()
    await store.write(settings)
    settings.modelId = 'mutated'
    const stored = await store.read()
    expect(stored?.modelId).toBe('frontier-fast')

    stored!.modelId = 'mutated-again'
    expect((await store.read())?.modelId).toBe('frontier-fast')
  })

  it('honours an aborted signal on settings reads and writes', async () => {
    const store = new InMemoryProviderSettingsStore()
    const controller = new AbortController()
    controller.abort()

    await expect(store.read(controller.signal)).rejects.toThrowError()
    await expect(store.write(valid(), controller.signal)).rejects.toThrowError()
  })
})

function valid(): Provider302AiSettings {
  return {
    version: 1,
    baseUrl,
    modelId: 'frontier-fast',
    modelName: 'Frontier Fast',
    compatibility: 'compatible',
    lastTestedAt: 10,
    lastModelsRefreshAt: 20,
  }
}
