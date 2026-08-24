/** OpenAI-compatible preset catalog. A preset only fills Base URL; it is not a Provider implementation. */

export const OPENAI_COMPATIBLE_PROVIDER_ID = 'openai-compatible'
export const OPENAI_COMPATIBLE_PROVIDER_LABEL = 'OpenAI-compatible'
export const PROVIDER_PRESET_CUSTOM_ID = 'custom'

export const PROVIDER_CREDENTIAL_FILE = 'agent-provider-credential.json'
export const PROVIDER_SETTINGS_FILE = 'agent-provider-settings.json'
export const LEGACY_PROVIDER_CREDENTIAL_FILE = 'agent-provider-302ai-credential.json'
export const LEGACY_PROVIDER_SETTINGS_FILE = 'agent-provider-302ai-settings.json'

export const LIVE_PROVIDER_API_KEY_ENV = 'KQ_LLM_API_KEY'
export const LIVE_PROVIDER_API_KEY_LEGACY_ENV = 'KQ_302AI_API_KEY'
export const LIVE_PROVIDER_BASE_URL_ENV = 'KQ_LLM_BASE_URL'
export const LIVE_PROVIDER_MODEL_ENV = 'KQ_LLM_MODEL'

export interface ProviderPreset {
  readonly id: string
  readonly label: string
  readonly baseUrl: string
  readonly aliases?: readonly string[]
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  { id: PROVIDER_PRESET_CUSTOM_ID, label: 'Custom', baseUrl: '' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    aliases: ['https://api.deepseek.com/v1'],
  },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  {
    id: 'dashscope-cn',
    label: 'DashScope CN',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    id: 'dashscope-intl',
    label: 'DashScope Intl',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  { id: 'moonshot-cn', label: 'Moonshot CN', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'moonshot-intl', label: 'Moonshot Intl', baseUrl: 'https://api.moonshot.ai/v1' },
  {
    id: 'gemini-openai',
    label: 'Gemini (OpenAI compat)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: '302ai', label: '302.ai', baseUrl: 'https://api.302.ai/v1' },
]

/** 按 id 取预设；未知 id 回落 Custom。 */
export function providerPresetById(id: string): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? PROVIDER_PRESETS[0]!
}

function canonicalizePresetUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/** 将 Base URL 映射到预设 id；无法识别时视为 Custom。 */
export function matchProviderPresetId(baseUrl: string | undefined): string {
  const normalized = canonicalizePresetUrl(baseUrl ?? '')
  if (!normalized) return PROVIDER_PRESET_CUSTOM_ID
  for (const preset of PROVIDER_PRESETS) {
    const candidates = [preset.baseUrl, ...(preset.aliases ?? [])]
    if (candidates.some((url) => canonicalizePresetUrl(url) === normalized)) return preset.id
  }
  return PROVIDER_PRESET_CUSTOM_ID
}

/** 状态栏展示名：命中具名预设用其标签，否则用中性 OpenAI-compatible。 */
export function providerLabelForBaseUrl(baseUrl: string | undefined): string {
  const preset = providerPresetById(matchProviderPresetId(baseUrl))
  return preset.id === PROVIDER_PRESET_CUSTOM_ID ? OPENAI_COMPATIBLE_PROVIDER_LABEL : preset.label
}
