// 浏览器 Agent bridge 模块的契约层：定义 bridge 装配所需的宿主依赖；实现位于 impl/。

import type {
  ProviderCredentialStore,
  RedactionOptions,
} from '@363045841yyt/klinechart-agent-runtime'
import type { BrowserRuntimeSessions } from '@363045841yyt/klinechart-agent-runtime/browser'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type { BrowserManagedProvider } from '../provider/types.js'

/** 浏览器 Agent bridge 的宿主依赖；未注入时使用 Web 端默认实现。 */
export interface BrowserAgentBridgeOptions {
  /** 测试或嵌入宿主可注入官方 Pi 存储，默认使用浏览器 IndexedDB。 */
  readonly createSessions?: (redaction: RedactionOptions) => Promise<BrowserRuntimeSessions>
  /** 返回当前可用的 ChartAgentController；图表尚未挂载时返回空。 */
  readonly getChartAgent?: () => ChartAgentController | null | undefined
  /**
   * 替换默认的 localStorage 凭据存储。Electron 宿主注入 safeStorage 实现；
   * 不传时行为与 Web 端完全一致。注入后 apiKey 不再写入 localStorage。
   */
  readonly credentials?: ProviderCredentialStore
  /**
   * 宿主预置的托管 Provider。提供后它成为配置列表首项，并在用户未选择其他配置时默认生效；
   * 设置界面隐藏其连接与模型选择，用户仍可添加自己的 Provider。
   */
  readonly managedProvider?: BrowserManagedProvider
}
