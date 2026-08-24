/** OpenAI-compatible Provider 的凭据、设置与运行时选项。 */

import type { ProviderPersistenceMode } from '../contracts/ui.js'

export const PROVIDER_SETTINGS_VERSION = 1 as const

export interface ProviderCredentialMetadata {
  persistenceMode: ProviderPersistenceMode
  warning?: string
}

export interface ProviderCredentialStore {
  read(signal?: AbortSignal): Promise<string | undefined>
  write(apiKey: string, signal?: AbortSignal): Promise<void>
  delete(signal?: AbortSignal): Promise<void>
  metadata(): Promise<ProviderCredentialMetadata>
}

export interface ProviderSettings {
  version: typeof PROVIDER_SETTINGS_VERSION
  baseUrl: string
  modelId: string
  modelName: string
  compatibility: 'compatible'
  lastTestedAt: number
  lastModelsRefreshAt: number
}

/** @deprecated 使用 ProviderSettings。保留别名以免破坏已编译的调用方。 */
export type Provider302AiSettings = ProviderSettings

export interface ProviderSettingsStore {
  read(signal?: AbortSignal): Promise<ProviderSettings | undefined>
  write(settings: ProviderSettings, signal?: AbortSignal): Promise<void>
}

export interface ProviderRuntimeOptions {
  credentials: ProviderCredentialStore
  settings: ProviderSettingsStore
  fetch?: typeof globalThis.fetch
  now?: () => number
  sleep?: (milliseconds: number, signal?: AbortSignal): Promise<void>
  requestTimeoutMs?: number
  maxRetries?: number
  maxRetryDelayMs?: number
}

/** @deprecated 使用 ProviderRuntimeOptions。 */
export type Provider302AiRuntimeOptions = ProviderRuntimeOptions
