import type { KLineData } from '@/types/price'

// 重新导出日期格式化函数以保持向后兼容
export { formatShanghaiDate } from '@/utils/dateFormat'
import { getColors } from '@/core/theme/colors'

export function getUpDownColor(delta: number, theme: 'light' | 'dark' = 'light'): string {
    const colors = getColors(theme)
    if (delta > 0) return colors.PRICE.UP
    if (delta < 0) return colors.PRICE.DOWN
    return colors.PRICE.NEUTRAL
}

/** 成交量/成交额单位换算：万/亿 */
export function formatWanYi(n: number, digits = 2): string {
    const abs = Math.abs(n)
    if (abs >= 1e8) return `${(n / 1e8).toFixed(digits)}亿`
    if (abs >= 1e4) return `${(n / 1e4).toFixed(digits)}万`
    // 小数意义不大，默认取整
    return `${Math.round(n)}`
}

export function formatSignedNumber(n: number, digits = 2): string {
    const sign = n > 0 ? '+' : ''
    return `${sign}${n.toFixed(digits)}`
}

export function formatPercent(n: number, digits = 2): string {
    return `${n.toFixed(digits)}%`
}

export function formatSignedPercent(n: number, digits = 2): string {
    const sign = n > 0 ? '+' : ''
    return `${sign}${n.toFixed(digits)}%`
}

export function calcOpenColor(k: KLineData, prev?: KLineData, theme: 'light' | 'dark' = 'light'): string {
    const base = prev?.close ?? k.open
    return getUpDownColor(k.open - base, theme)
}

export function calcCloseColor(k: KLineData, theme: 'light' | 'dark' = 'light'): string {
    return getUpDownColor(k.close - k.open, theme)
}

export function calcChangeColor(k: KLineData, theme: 'light' | 'dark' = 'light'): string {
    const colors = getColors(theme)
    if (typeof k.changePercent === 'number') return getUpDownColor(k.changePercent, theme)
    if (typeof k.changeAmount === 'number') return getUpDownColor(k.changeAmount, theme)
    return colors.PRICE.NEUTRAL
}
