interface HttpParams {
  params?: Record<string, string | number | undefined>
  timeout?: number
}

interface HttpResponse<T> {
  data: T
}

export class HttpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HttpError'
  }

  static isHttpError(error: unknown): error is HttpError {
    return error instanceof HttpError
  }
}

async function get<T>(url: string, config?: HttpParams): Promise<HttpResponse<T>> {
  const searchParams = new URLSearchParams()
  if (config?.params) {
    for (const [key, value] of Object.entries(config.params)) {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value))
      }
    }
  }
  const queryString = searchParams.toString()
  const fullUrl = queryString ? `${url}?${queryString}` : url

  const controller = new AbortController()
  const timeoutId = config?.timeout
    ? setTimeout(() => controller.abort(), config.timeout)
    : undefined

  try {
    const response = await fetch(fullUrl, { signal: controller.signal })
    if (!response.ok) {
      throw new HttpError(`HTTP ${response.status}: ${response.statusText}`)
    }
    return { data: await response.json() }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if ((error as Error)?.name === 'AbortError') {
      throw new HttpError('请求超时')
    }
    throw new HttpError((error as Error)?.message || '网络请求失败')
  } finally {
    clearTimeout(timeoutId)
  }
}

export { get }
export type { HttpParams, HttpResponse }
