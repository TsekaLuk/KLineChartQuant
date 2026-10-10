// Provider 请求的浏览器 fetch 适配：移除 Pi SDK 诊断头，避免 CORS 预检被拒。

/**
 * 基于给定 fetch 创建适配后的 fetch；未指定时每次调用都读取当前全局 fetch。
 * 移除 Pi SDK 的浏览器诊断头，避免不支持这些头的 OpenAI-compatible Provider 拒绝 CORS 预检。
 */
export function createBrowserProviderFetch(base?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    for (const name of [...headers.keys()]) {
      if (name.startsWith('x-stainless-')) headers.delete(name)
    }
    return (base ?? fetch)(input, { ...init, headers })
  }
}

/** 使用全局 fetch 的默认适配。 */
export const fetchBrowserProvider = createBrowserProviderFetch()
