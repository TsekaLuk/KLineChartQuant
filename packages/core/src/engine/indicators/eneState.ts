import type { BaseIndicatorState } from '../../plugin'
import { createIndicatorStateKey } from '../../plugin/stateKeys'
import type { ENEPoint } from './calculators'

/**
 * ENE 渲染器状态（共享给渲染器和图例）
 * 包含全量 ENE 数组、计算参数、以及视口极值
 */
export interface ENERenderState extends BaseIndicatorState {
    timestamp: number
    /** 全量 ENE 数组（稀疏：前 period-1 个为 undefined） */
    series: ENEPoint[]
    /** 计算参数 */
    params: {
        period: number
        deviation: number
    }
    /** 视口内所有 ENE 线的最低价 */
    visibleMin: number
    /** 视口内所有 ENE 线的最高价 */
    visibleMax: number
}

/**
 * ENE 状态的 StateStore 键名
 * 格式：indicator:ene:main
 */
export const ENE_STATE_KEY = createIndicatorStateKey('ene', 'main')

/**
 * 空数据占位状态
 * 消费者应检查 visibleMin > visibleMax 判断"无有效数据"
 */
export const EMPTY_ENE_STATE: ENERenderState = {
    timestamp: 0,
    series: [],
    params: {
        period: 10,
        deviation: 11,
    },
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
