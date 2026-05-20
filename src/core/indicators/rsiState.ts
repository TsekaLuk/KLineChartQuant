import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

/**
 * RSI 渲染器状态（共享给渲染器、图例和 scale 渲染器）
 * 包含全量 RSI 数组、计算参数、固定 Y 轴范围以及视口极值
 */
export interface RSIRenderState extends BaseIndicatorState {
    timestamp: number
    /** 各周期 RSI 数组（稀疏：前 period+1 个为 undefined） */
    series: Record<number, (number | undefined)[]>
    /** 当前启用的周期列表 */
    enabledPeriods: number[]
    /** 计算和渲染参数 */
    params: {
        period1: number
        period2: number
        period3: number
        showRSI1: boolean
        showRSI2: boolean
        showRSI3: boolean
    }
    /** 固定 Y 轴最小值（始终为 0） */
    valueMin: number
    /** 固定 Y 轴最大值（始终为 100） */
    valueMax: number
    /** 视口内所有 RSI 线的最小值 */
    visibleMin: number
    /** 视口内所有 RSI 线的最大值 */
    visibleMax: number
}

/**
 * 创建 RSI 状态的 StateStore 键名
 * 格式：indicator:rsi:{paneId}
 */
export const createRSIStateKey = (paneId: string) =>
    createIndicatorStateKey('rsi', paneId) as const

/**
 * 空数据占位状态
 * 消费者应检查 visibleMin > visibleMax 判断"无有效数据"
 */
export const EMPTY_RSI_STATE: RSIRenderState = {
    timestamp: 0,
    series: {},
    enabledPeriods: [],
    params: {
        period1: 6,
        period2: 12,
        period3: 24,
        showRSI1: true,
        showRSI2: true,
        showRSI3: true,
    },
    valueMin: 0,
    valueMax: 100,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
