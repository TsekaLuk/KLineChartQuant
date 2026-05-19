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
