import type { KLineData } from '@/types/price'

/**
 * MA 周期配置标志
 */
export type MAFlags = {
    ma5?: boolean
    ma10?: boolean
    ma20?: boolean
    ma30?: boolean
    ma60?: boolean
}

/**
 * 默认 MA 周期列表
 */
export const DEFAULT_MA_PERIODS = [5, 10, 20, 30, 60] as const

// ============================================================================
// BOLL 布林带
// ============================================================================

/**
 * BOLL 数据点
 */
export interface BOLLPoint {
    upper: number
    middle: number
    lower: number
}

/**
 * 默认 BOLL 参数
 */
export const DEFAULT_BOLL_PERIOD = 20
export const DEFAULT_BOLL_MULTIPLIER = 2

/**
 * 计算 BOLL 数据（使用滑动窗口优化）
 * @param data K线数据数组
 * @param period 周期（默认20）
 * @param multiplier 标准差倍数（默认2）
 * @returns 每个索引对应的BOLL值，前 period-1 个为 undefined
 */
export function calcBOLLData(
    data: KLineData[],
    period: number,
    multiplier: number
): BOLLPoint[] {
    const result: BOLLPoint[] = new Array(data.length)

    if (data.length < period) return result

    // 使用滑动窗口计算，避免重复求和
    let sum = 0
    const window: number[] = []

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        const close = item.close
        window.push(close)
        sum += close
    }

    // 计算每个点的 BOLL
    for (let i = period - 1; i < data.length; i++) {
        const item = data[i]
        if (!item) continue

        // 更新窗口求和
        if (i >= period) {
            const oldVal = window.shift()
            if (oldVal !== undefined) sum -= oldVal
            const close = item.close
            window.push(close)
            sum += close
        }

        const ma = sum / period

        // 计算标准差
        let variance = 0
        for (let j = 0; j < period; j++) {
            const wVal = window[j]
            if (wVal !== undefined) {
                variance += Math.pow(wVal - ma, 2)
            }
        }
        const stdDev = Math.sqrt(variance / period)

        result[i] = {
            upper: ma + multiplier * stdDev,
            middle: ma,
            lower: ma - multiplier * stdDev,
        }
    }

    return result
}

// ============================================================================
// EXPMA 指数平滑移动平均线
// ============================================================================

/**
 * EXPMA 数据点
 */
export interface EXPMAPoint {
    fast: number
    slow: number
}

/**
 * 默认 EXPMA 参数
 */
export const DEFAULT_EXPMA_FAST_PERIOD = 12
export const DEFAULT_EXPMA_SLOW_PERIOD = 50

/**
 * 计算 EXPMA 数据
 * 公式：EXPMA(i) = C(i) × K + EXPMA(i-1) × (1-K)，K = 2/(N+1)
 * @param data K线数据数组
 * @param fastPeriod 快线周期（默认12）
 * @param slowPeriod 慢线周期（默认50）
 * @returns 每个索引对应的EXPMA值（从 index 0 开始有值）
 */
export function calcEXPMAData(
    data: KLineData[],
    fastPeriod: number,
    slowPeriod: number
): EXPMAPoint[] {
    const result: EXPMAPoint[] = new Array(data.length)

    if (data.length === 0) return result

    const fastK = 2 / (fastPeriod + 1)
    const slowK = 2 / (slowPeriod + 1)

    // 第一个点的 EXPMA 等于第一天的收盘价
    const firstClose = data[0]!.close
    let fastEMA = firstClose
    let slowEMA = firstClose

    result[0] = { fast: fastEMA, slow: slowEMA }

    for (let i = 1; i < data.length; i++) {
        const close = data[i]!.close
        fastEMA = close * fastK + fastEMA * (1 - fastK)
        slowEMA = close * slowK + slowEMA * (1 - slowK)
        result[i] = { fast: fastEMA, slow: slowEMA }
    }

    return result
}

// ============================================================================
// ENE 轨道线
// ============================================================================

/**
 * ENE 数据点
 */
export interface ENEPoint {
    upper: number
    middle: number
    lower: number
}

/**
 * 默认 ENE 参数
 */
export const DEFAULT_ENE_PERIOD = 10
export const DEFAULT_ENE_DEVIATION = 11

/**
 * 计算 ENE 数据
 * 中轨 = MA(close, N)
 * 上轨 = 中轨 × (1 + M/100)
 * 下轨 = 中轨 × (1 - M/100)
 * @param data K线数据数组
 * @param period 周期（默认10）
 * @param deviation 偏离率百分比（默认11）
 * @returns 每个索引对应的ENE值，前 period-1 个为 undefined
 */
export function calcENEData(
    data: KLineData[],
    period: number,
    deviation: number
): ENEPoint[] {
    const result: ENEPoint[] = new Array(data.length)

    if (data.length < period) return result

    // 使用滑动窗口计算 MA
    let sum = 0

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        sum += item.close
    }

    // 第一个有效点
    const firstMA = sum / period
    const firstDeviation = deviation / 100
    result[period - 1] = {
        upper: firstMA * (1 + firstDeviation),
        middle: firstMA,
        lower: firstMA * (1 - firstDeviation),
    }

    // 滑动计算后续点
    for (let i = period; i < data.length; i++) {
        const prevItem = data[i - period]
        const currItem = data[i]
        if (!prevItem || !currItem) continue

        sum = sum - prevItem.close + currItem.close
        const ma = sum / period
        const dev = deviation / 100

        result[i] = {
            upper: ma * (1 + dev),
            middle: ma,
            lower: ma * (1 - dev),
        }
    }

    return result
}

/**
 * 计算指定周期的 MA 数据（使用滑动窗口优化，O(n) 复杂度）
 * @param data K线数据数组
 * @param period MA周期
 * @returns 每个索引对应的MA值，前 period-1 个为 undefined
 */
export function calcMAData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    // 滑动窗口求和
    let sum = 0

    // 初始化第一个窗口
    for (let i = 0; i < period; i++) {
        const item = data[i]
        if (!item) return result
        sum += item.close
    }

    // 第一个有效点
    result[period - 1] = sum / period

    // 滑动计算后续点
    for (let i = period; i < data.length; i++) {
        const prevItem = data[i - period]
        const currItem = data[i]
        if (!prevItem || !currItem) continue

        sum = sum - prevItem.close + currItem.close
        result[i] = sum / period
    }

    return result
}

// ============================================================================
// RSI 相对强弱指标
// ============================================================================

/**
 * 默认 RSI 参数
 */
export const DEFAULT_RSI_PERIOD1 = 6
export const DEFAULT_RSI_PERIOD2 = 12
export const DEFAULT_RSI_PERIOD3 = 24
export const DEFAULT_RSI_PERIODS = [6, 12, 24] as const

/**
 * 计算 RSI 数据
 * RSI = 100 - 100 / (1 + RS)
 * RS = 平均上涨幅度 / 平均下跌幅度
 * @param data K线数据数组
 * @param period RSI周期
 * @returns 每个索引对应的RSI值，前 period+1 个为 undefined（需要 period+1 个数据点计算初始平均）
 */
export function calcRSIData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    // 计算价格变化
    const changes: number[] = []
    for (let i = 1; i < data.length; i++) {
        changes.push(data[i]!.close - data[i - 1]!.close)
    }

    // 初始化：计算前 period 天的平均涨跌
    let sumGain = 0
    let sumLoss = 0

    for (let i = 0; i < period; i++) {
        const change = changes[i]
        if (change !== undefined) {
            if (change > 0) sumGain += change
            else sumLoss += Math.abs(change)
        }
    }

    // 第一个 RSI 值
    let avgGain = sumGain / period
    let avgLoss = sumLoss / period

    if (avgLoss === 0) {
        result[period] = 100
    } else {
        const rs = avgGain / avgLoss
        result[period] = 100 - 100 / (1 + rs)
    }

    // 后续使用平滑计算（Wilder's smoothing）
    for (let i = period; i < changes.length; i++) {
        const change = changes[i]
        if (change === undefined) continue

        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period
            avgLoss = (avgLoss * (period - 1)) / period
        } else {
            avgGain = (avgGain * (period - 1)) / period
            avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period
        }

        if (avgLoss === 0) {
            result[i + 1] = 100
        } else {
            const rs = avgGain / avgLoss
            result[i + 1] = 100 - 100 / (1 + rs)
        }
    }

    return result
}

// ============================================================================
// CCI 顺势指标
// ============================================================================

export const DEFAULT_CCI_PERIOD = 14

export function calcCCIData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    // 计算 TP (Typical Price) = (H + L + C) / 3
    const tpValues: number[] = []
    for (const item of data) {
        tpValues.push((item.high + item.low + item.close) / 3)
    }

    // 计算 TP 的 SMA
    let sum = 0
    for (let i = 0; i < period; i++) {
        sum += tpValues[i]!
    }

    for (let i = period - 1; i < data.length; i++) {
        if (i >= period) {
            sum = sum - tpValues[i - period]! + tpValues[i]!
        }
        const sma = sum / period

        // 计算平均绝对偏差
        let meanDeviation = 0
        for (let j = 0; j < period; j++) {
            meanDeviation += Math.abs(tpValues[i - j]! - sma)
        }
        meanDeviation /= period

        if (meanDeviation === 0) {
            result[i] = 0
        } else {
            result[i] = (tpValues[i]! - sma) / (0.015 * meanDeviation)
        }
    }

    return result
}

// ============================================================================
// STOCH 随机指标
// ============================================================================

export const DEFAULT_STOCH_N = 9
export const DEFAULT_STOCH_M = 3

export interface STOCHPoint {
    k: number
    d: number
}

export function calcSTOCHData(data: KLineData[], n: number, m: number): STOCHPoint[] {
    const result: STOCHPoint[] = new Array(data.length)

    if (data.length < n) return result

    // 计算 RSV 和 K
    const kValues: (number | undefined)[] = new Array(data.length)

    for (let i = n - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < n; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            kValues[i] = 50
        } else {
            kValues[i] = ((close - lowest) / (highest - lowest)) * 100
        }
    }

    // 计算 D (K 的 M 日移动平均)
    for (let i = n - 1 + m - 1; i < data.length; i++) {
        const k = kValues[i]
        if (k === undefined) continue

        let sum = 0
        let validCount = 0
        for (let j = 0; j < m; j++) {
            const kv = kValues[i - j]
            if (kv !== undefined) {
                sum += kv
                validCount++
            }
        }

        if (validCount === m) {
            result[i] = { k, d: sum / m }
        }
    }

    return result
}

// ============================================================================
// MOM 动量指标
// ============================================================================

export const DEFAULT_MOM_PERIOD = 10

export function calcMOMData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    for (let i = period; i < data.length; i++) {
        const currentClose = data[i]?.close
        const prevClose = data[i - period]?.close

        if (currentClose !== undefined && prevClose !== undefined) {
            result[i] = currentClose - prevClose
        }
    }

    return result
}

// ============================================================================
// WMSR 威廉指标
// ============================================================================

export const DEFAULT_WMSR_PERIOD = 14

export function calcWMSRData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    for (let i = period - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < period; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            result[i] = -50
        } else {
            result[i] = ((highest - close) / (highest - lowest)) * -100
        }
    }

    return result
}

// ============================================================================
// KST 确知指标
// ============================================================================

export const DEFAULT_KST_ROC1 = 10
export const DEFAULT_KST_ROC2 = 15
export const DEFAULT_KST_ROC3 = 20
export const DEFAULT_KST_ROC4 = 30
export const DEFAULT_KST_SIGNAL = 9

export interface KSTPoint {
    kst: number
    signal: number
}

function calcROCInternal(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period + 1) return result

    for (let i = period; i < data.length; i++) {
        const currentClose = data[i]?.close
        const prevClose = data[i - period]?.close

        if (currentClose !== undefined && prevClose !== undefined && prevClose !== 0) {
            result[i] = ((currentClose - prevClose) / prevClose) * 100
        }
    }

    return result
}

function calcSMAInternal(data: (number | undefined)[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    let sum = 0
    let count = 0

    for (let i = 0; i < data.length; i++) {
        const val = data[i]

        if (val !== undefined) {
            sum += val
            count++

            if (count > period) {
                const oldVal = data[i - period]
                if (oldVal !== undefined) {
                    sum -= oldVal
                    count--
                }
            }

            if (count === period) {
                result[i] = sum / period
            }
        }
    }

    return result
}

export function calcKSTData(
    data: KLineData[],
    roc1: number,
    roc2: number,
    roc3: number,
    roc4: number,
    signalPeriod: number
): KSTPoint[] {
    const result: KSTPoint[] = new Array(data.length)

    const roc1Data = calcROCInternal(data, roc1)
    const roc2Data = calcROCInternal(data, roc2)
    const roc3Data = calcROCInternal(data, roc3)
    const roc4Data = calcROCInternal(data, roc4)

    const sma1 = calcSMAInternal(roc1Data, 10)
    const sma2 = calcSMAInternal(roc2Data, 10)
    const sma3 = calcSMAInternal(roc3Data, 10)
    const sma4 = calcSMAInternal(roc4Data, 15)

    const kstValues: (number | undefined)[] = new Array(data.length)

    for (let i = 0; i < data.length; i++) {
        const v1 = sma1[i]
        const v2 = sma2[i]
        const v3 = sma3[i]
        const v4 = sma4[i]

        if (v1 !== undefined && v2 !== undefined && v3 !== undefined && v4 !== undefined) {
            kstValues[i] = v1 * 1 + v2 * 2 + v3 * 3 + v4 * 4
        }
    }

    const signalData = calcSMAInternal(kstValues, signalPeriod)

    for (let i = 0; i < data.length; i++) {
        const kst = kstValues[i]
        const signal = signalData[i]

        if (kst !== undefined && signal !== undefined) {
            result[i] = { kst, signal }
        }
    }

    return result
}

// ============================================================================
// FASTK 快速随机指标
// ============================================================================

export const DEFAULT_FASTK_PERIOD = 9

export function calcFASTKData(data: KLineData[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = new Array(data.length)

    if (data.length < period) return result

    for (let i = period - 1; i < data.length; i++) {
        let highest = -Infinity
        let lowest = Infinity

        for (let j = 0; j < period; j++) {
            const item = data[i - j]
            if (!item) continue
            highest = Math.max(highest, item.high)
            lowest = Math.min(lowest, item.low)
        }

        const close = data[i]!.close
        if (highest === lowest) {
            result[i] = 50
        } else {
            result[i] = ((close - lowest) / (highest - lowest)) * 100
        }
    }

    return result
}
