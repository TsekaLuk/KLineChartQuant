/** Live / E2E 环境变量解析。厂商别名只用于兼容已有密钥，不是产品默认值。 */

import {
  LIVE_PROVIDER_API_KEY_ENV,
  LIVE_PROVIDER_API_KEY_LEGACY_ENV,
  LIVE_PROVIDER_BASE_URL_ENV,
  LIVE_PROVIDER_MODEL_ENV,
} from '../contracts/provider-presets.js'

export interface LiveProviderEnv {
  readonly apiKey?: string
  readonly baseUrl?: string
  readonly modelId?: string
}

/** 读取中性 live 环境；`KQ_302AI_API_KEY` 仅作已废弃的密钥别名。 */
export function readLiveProviderEnv(
  env: Record<string, string | undefined> = process.env,
): LiveProviderEnv {
  const apiKey = env[LIVE_PROVIDER_API_KEY_ENV]?.trim() || env[LIVE_PROVIDER_API_KEY_LEGACY_ENV]?.trim()
  const baseUrl = env[LIVE_PROVIDER_BASE_URL_ENV]?.trim()
  const modelId = env[LIVE_PROVIDER_MODEL_ENV]?.trim()
  return {
    apiKey: apiKey || undefined,
    baseUrl: baseUrl || undefined,
    modelId: modelId || undefined,
  }
}
