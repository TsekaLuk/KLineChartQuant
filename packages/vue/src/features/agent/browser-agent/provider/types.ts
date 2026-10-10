// Provider 配置、模型池与凭据持久化的数据契约层；实现位于 impl/。

import type {
  OpenAiCompatibleProviderSettings,
  ProviderCredentialStore,
  ProviderModelPoolEntry,
} from '@363045841yyt/klinechart-agent-runtime'
import type { ProviderApiProtocol } from '../../agent-contracts.js'

/** Provider 连接配置独立于运行模型保存，便于在 Composer 中切换模型。 */
export interface BrowserProviderConnection {
  baseUrl: string
  headers: Record<string, string>
  protocol: ProviderApiProtocol
}

/** 浏览器端 Provider 配置档案；apiKey 实际由凭据存储持有。 */
export interface BrowserProviderProfile {
  name: string
  apiKey: string
  /** 仅用于读取旧设置文档；Exa Key 已迁移到全局 Agent 设置。 */
  exaApiKey?: string
  settings?: OpenAiCompatibleProviderSettings
  connection?: BrowserProviderConnection
  active: boolean
  /** 宿主托管的配置：仅存在于内存，从不写入 LocalStorage。 */
  managed?: boolean
}

/** 宿主托管 Provider 的固定模型；真实路由由宿主服务端决定，界面不提供选择。 */
export interface BrowserManagedProviderModel {
  /** 随请求发送的模型标识，宿主服务端可将其视为占位。 */
  id: string
  /** 用于界面展示的模型名称；缺省使用 id。 */
  name?: string
  contextWindow?: number
  maxOutputTokens?: number
}

/**
 * 宿主预置的已验证 OpenAI-compatible Provider。
 * 它出现在配置列表首位，未选择其他配置时默认生效；界面不展示其 Base URL、Key 与模型选择。
 */
export interface BrowserManagedProvider {
  /** 配置列表中的显示名称，不得与用户配置重名。 */
  name: string
  /** Provider API 根地址，例如 `<origin>/ai/v1`。 */
  baseUrl: string
  /** 缺省为 `openai-completions`。 */
  protocol?: ProviderApiProtocol
  /** 附加的非鉴权请求头。 */
  headers?: Record<string, string>
  model: BrowserManagedProviderModel
  /** 只读凭据存储；浏览器仅需占位值，真实鉴权由 `fetch` 或服务端完成。 */
  credentials: ProviderCredentialStore
  /** 该 Provider 的全部请求（目录与流式）使用的 fetch，例如携带 Cookie 并移除 Authorization。 */
  fetch?: typeof globalThis.fetch
}

/** LocalStorage 中 Agent 模型设置的持久化文档。 */
export interface BrowserAgentModelSettings {
  profiles: BrowserProviderProfile[]
  modelPool: ProviderModelPoolEntry[]
  enabledTools: string[]
  /** 全局 Web Search 凭据，不随 Provider Profile 切换。 */
  exaApiKey?: string
}
