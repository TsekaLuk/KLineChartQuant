const SECRET_KEY = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i
const HIDDEN_KEY = /(?:chain[-_]?of[-_]?thought|hidden[-_]?thinking|reasoning[-_]?content)/i

// `SECRET_KEY` 的 token 规则会误伤本机撤销句柄。undoToken 不是凭证，且是审计轨迹
// 的必需字段，因此显式豁免；新增豁免必须确认该字段永远不承载凭证。
const NON_SECRET_KEYS = new Set(['undotoken'])

function isSecretKey(key: string): boolean {
  if (NON_SECRET_KEYS.has(key.toLowerCase())) return false
  return SECRET_KEY.test(key) || HIDDEN_KEY.test(key)
}
const AUTHORIZATION = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
const API_KEY = /\bsk-[A-Za-z0-9_-]{12,}\b/g
const LOCAL_PATH = /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/g

export interface RedactionOptions {
  secretValues?: readonly string[]
  replacement?: string
}

export function redactString(value: string, options: RedactionOptions = {}): string {
  const replacement = options.replacement ?? '[REDACTED]'
  let redacted = value.replace(AUTHORIZATION, replacement).replace(API_KEY, replacement)
  redacted = redacted.replace(LOCAL_PATH, '[LOCAL_PATH]')
  for (const secret of options.secretValues ?? []) {
    if (secret.length > 0) redacted = redacted.split(secret).join(replacement)
  }
  return redacted
}

export function redactValue(value: unknown, options: RedactionOptions = {}): unknown {
  if (typeof value === 'string') return redactString(value, options)
  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : redactValue(entry, options)))
  }
  if (value === null || typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue
    if (isSecretKey(key)) {
      output[key] = '[REDACTED]'
    } else {
      output[key] = redactValue(entry, options)
    }
  }
  return output
}
