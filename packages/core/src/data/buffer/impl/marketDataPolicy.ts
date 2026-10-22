/** 行情缓存取数策略：定义初始窗口大小与统一重试退避。 */

// ── Constants ──

const FETCH_MAX_RETRIES = 2 // 最大重试次数
export const FETCH_TOTAL_ATTEMPTS = FETCH_MAX_RETRIES + 1
const MEBIBYTE = 1024 * 1024
/** 每个图表实例默认允许的行情缓存上限。 */
export const DEFAULT_MARKET_DATA_CACHE_MAX_BYTES = 50 * MEBIBYTE
const MIN_MARKET_DATA_CACHE_MAX_MIB = 5
const MAX_MARKET_DATA_CACHE_MAX_MIB = 512
/** 初始加载和向左增量加载的最小请求根数。 */
export const DEFAULT_BAR_PAGE_LIMIT = 500
/** 单轮历史加载的工作预算，不是 HTTP 单页限制，也不是历史总量上限；不足部分由下一轮补齐。 */
export const MAX_BAR_PAGE_LIMIT = 5_000
/** 首次请求覆盖的屏数：一屏可见 K 线外再留一屏左侧余量，首屏一次铺满。 */
export const INITIAL_BAR_SCREENS = 2
/** 左侧已加载余量少于该屏数时，在用户触达左缘前提前预取。 */
export const HISTORY_PREFETCH_TRIGGER_SCREENS = 0.75
/** 每批向左预取覆盖的屏数（另加当前已露出的空白槽位）。 */
export const HISTORY_PREFETCH_SCREENS = 2
/** 单轮串行页数预算；达到预算保留 Provider 的历史状态，后续按视口缺口继续调度。 */
export const MAX_HISTORY_BATCH_PAGES = 8

// ── Helpers ──

/** 将用户设置的 MiB 上限规范为安全的缓存字节上限。 */
export function resolveMarketDataCacheMaxBytes(value: unknown): number {
  const fallback = DEFAULT_MARKET_DATA_CACHE_MAX_BYTES / MEBIBYTE
  const mib = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.round(
    Math.min(MAX_MARKET_DATA_CACHE_MAX_MIB, Math.max(MIN_MARKET_DATA_CACHE_MAX_MIB, mib)) *
      MEBIBYTE,
  )
}

/**
 * 按需要覆盖的 K 线槽位数计算一次请求的根数。
 *
 * @param slots 需要覆盖的槽位数（可为小数）；视口未就绪（0 / 非有限值）时回退默认页大小。
 * @returns 落在 [DEFAULT_BAR_PAGE_LIMIT, MAX_BAR_PAGE_LIMIT] 内的整数根数。
 */
export function resolveBarRequestLimit(slots: number): number {
  if (!Number.isFinite(slots) || slots <= 0) return DEFAULT_BAR_PAGE_LIMIT
  return Math.min(MAX_BAR_PAGE_LIMIT, Math.max(DEFAULT_BAR_PAGE_LIMIT, Math.ceil(slots)))
}

// ── Retry backoff: 失败后等待约 1 秒 / 2 秒 ──

export function retryBackoffMs(attempt: number): number {
  return 1_000 * 2 ** Math.max(0, attempt - 1)
}
