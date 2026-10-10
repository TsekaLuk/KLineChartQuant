// 宿主托管 Provider：把宿主预置的连接投影为内存 Profile，并让凭据与 fetch 按当前生效配置路由。

import {
  AgentRuntimeError,
  normalizeProviderBaseUrl,
  type OpenAiCompatibleProviderSettings,
  PROVIDER_SETTINGS_VERSION,
  type ProviderCredentialStore,
  type ProviderModelPoolEntry,
  type ProviderProfileView,
} from '@363045841yyt/klinechart-agent-runtime'
import type { BrowserManagedProvider, BrowserProviderProfile } from '../types.js'
import { createBrowserProviderFetch } from './browser-provider-fetch.js'

/** 托管模型未声明输出上限时的回退值，与用户模型池保持一致。 */
const DEFAULT_MANAGED_MAX_OUTPUT_TOKENS = 16_384

/** 宿主托管 Provider 的不可变投影：Profile、设置、模型池条目与视图。 */
export class ManagedProvider {
  private readonly settings: OpenAiCompatibleProviderSettings
  private readonly model: ProviderModelPoolEntry

  /**
   * @param config 宿主预置的 Provider。
   * @param verifiedAt 宿主视为已验证的时间戳。
   * @throws {AgentRuntimeError} 名称、地址或模型标识缺失时抛出。
   */
  constructor(
    private readonly config: BrowserManagedProvider,
    verifiedAt: number = Date.now(),
  ) {
    if (!config.name.trim() || !config.model.id.trim()) {
      throw new AgentRuntimeError(
        'PROVIDER_ERROR',
        'The managed Provider requires a name and a model id.',
      )
    }
    this.settings = {
      version: PROVIDER_SETTINGS_VERSION,
      baseUrl: normalizeProviderBaseUrl(config.baseUrl),
      headers: { ...config.headers },
      modelId: config.model.id,
      modelName: config.model.name ?? config.model.id,
      ...(config.model.contextWindow === undefined
        ? {}
        : { contextWindow: config.model.contextWindow }),
      maxOutputTokens: config.model.maxOutputTokens ?? DEFAULT_MANAGED_MAX_OUTPUT_TOKENS,
      reasoningEfforts: [],
      protocol: config.protocol ?? 'openai-completions',
      compatibility: 'compatible',
      lastTestedAt: verifiedAt,
      lastModelsRefreshAt: verifiedAt,
    }
    this.model = {
      id: this.settings.modelId,
      name: this.settings.modelName,
      compatibility: 'compatible',
      ...(this.settings.contextWindow === undefined
        ? {}
        : { contextWindow: this.settings.contextWindow }),
      maxOutputTokens: this.settings.maxOutputTokens,
      provider: config.name,
    }
  }

  get name(): string {
    return this.config.name
  }

  /** 供 Provider 请求使用的 fetch；与默认 Provider 一样移除 Pi 诊断头。 */
  get fetch(): typeof fetch {
    return createBrowserProviderFetch(this.config.fetch)
  }

  get credentials(): ProviderCredentialStore {
    return this.config.credentials
  }

  /** 唯一的托管模型，既是模型池也是模型目录。 */
  poolEntry(): ProviderModelPoolEntry {
    return { ...this.model }
  }

  /** 生成内存 Profile；`active` 由调用方根据用户配置推导。 */
  profile(active: boolean): BrowserProviderProfile {
    const { baseUrl, headers, protocol } = this.settings
    return {
      name: this.config.name,
      apiKey: '',
      settings: this.settings,
      connection: { baseUrl, headers, protocol },
      active,
      managed: true,
    }
  }

  /** 设置面板配置列表中的视图。 */
  view(): ProviderProfileView {
    return {
      name: this.config.name,
      managed: true,
      baseUrl: this.settings.baseUrl,
      modelId: this.settings.modelId,
      modelName: this.settings.modelName,
      protocol: this.settings.protocol,
      contextWindow: this.settings.contextWindow,
      maxOutputTokens: this.settings.maxOutputTokens,
      reasoningEfforts: this.settings.reasoningEfforts,
    }
  }
}

/** 托管配置不可修改时抛出的统一错误。 */
export function managedProviderReadOnlyError(): AgentRuntimeError {
  return new AgentRuntimeError('PROVIDER_ERROR', 'The managed Provider is controlled by the host.')
}

/** 按当前生效配置路由的凭据存储：托管配置读宿主凭据且只读，其余委托给用户凭据存储。 */
export class RoutedProviderCredentialStore implements ProviderCredentialStore {
  constructor(
    private readonly user: ProviderCredentialStore,
    private readonly managed: ProviderCredentialStore,
    private readonly isManagedActive: () => boolean,
  ) {}

  read(signal?: AbortSignal): Promise<string | undefined> {
    return (this.isManagedActive() ? this.managed : this.user).read(signal)
  }

  async write(apiKey: string, signal?: AbortSignal): Promise<void> {
    if (this.isManagedActive()) throw managedProviderReadOnlyError()
    await this.user.write(apiKey, signal)
  }

  async delete(signal?: AbortSignal): Promise<void> {
    if (this.isManagedActive()) throw managedProviderReadOnlyError()
    await this.user.delete(signal)
  }
}
