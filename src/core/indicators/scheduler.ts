import type { PluginHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import {
    calcMAData,
    calcBOLLData,
    calcEXPMAData,
    calcENEData,
} from './calculators'
import type {
    MAFlags,
    BOLLPoint,
    EXPMAPoint,
    ENEPoint,
} from './calculators'
import { DEFAULT_MA_PERIODS } from './calculators'
import type { MARenderState } from './maState'
import { MA_STATE_KEY } from './maState'
import type { BOLLRenderState } from './bollState'
import { BOLL_STATE_KEY } from './bollState'
import type { EXPMARenderState } from './expmaState'
import { EXPMA_STATE_KEY } from './expmaState'
import type { ENERenderState } from './eneState'
import { ENE_STATE_KEY } from './eneState'

/**
 * 可见范围
 */
interface VisibleRange {
    start: number
    end: number
}

/**
 * BOLL 调度器配置
 */
export interface BOLLSchedulerConfig {
    period: number
    multiplier: number
    showUpper: boolean
    showMiddle: boolean
    showLower: boolean
    showBand: boolean
}

/**
 * EXPMA 调度器配置
 */
export interface EXPMASchedulerConfig {
    fastPeriod: number
    slowPeriod: number
}

/**
 * ENE 调度器配置
 */
export interface ENESchedulerConfig {
    period: number
    deviation: number
}

/**
 * 指标调度器
 *
 * 职责：
 * 1. 维护当前图表激活的指标配置
 * 2. 在数据/视口/配置变更时触发计算
 * 3. 将计算结果写入 StateStore，供渲染器消费
 *
 * 优化策略：
 * - 双脏标记（dirtyData/dirtyRange）：数据变更重算 series + 极值，视口变更仅重算极值
 * - cachedSeries 缓存：视口变更时复用已计算的 series，避免 O(n) 重算
 */
export class IndicatorScheduler {
    private pluginHost: PluginHost | null = null
    private currentData: KLineData[] = []
    private maConfig: MAFlags = { ma5: true, ma10: true, ma20: true, ma30: true, ma60: true }
    private visibleRange: VisibleRange = { start: 0, end: 0 }

    // MA 缓存
    private cachedSeries: Record<number, (number | undefined)[]> = {}

    // BOLL 配置和缓存
    private bollConfig: BOLLSchedulerConfig = {
        period: 20,
        multiplier: 2,
        showUpper: true,
        showMiddle: true,
        showLower: true,
        showBand: true,
    }
    private cachedBollSeries: BOLLPoint[] = []

    // EXPMA 配置和缓存
    private expmaConfig: EXPMASchedulerConfig = {
        fastPeriod: 12,
        slowPeriod: 50,
    }
    private cachedExpmaSeries: EXPMAPoint[] = []

    // ENE 配置和缓存
    private eneConfig: ENESchedulerConfig = {
        period: 10,
        deviation: 11,
    }
    private cachedEneSeries: ENEPoint[] = []

    // 双脏标记（数据/视口）
    private dirtyData = true   // 数据变更 → 重算所有 series + 极值
    private dirtyRange = true  // 仅视口变更 → 仅重算极值

    // 各指标配置脏标记（配置变更时仅重算该指标）
    private dirtyBollConfig = true
    private dirtyExpmaConfig = true
    private dirtyEneConfig = true

    /**
     * 设置 PluginHost，用于读写 StateStore
     */
    setPluginHost(host: PluginHost): void {
        this.pluginHost = host
    }

    /**
     * 数据变更时调用
     * @param data 新的 K 线数据
     * @param visibleRange 当前可见范围
     */
    update(data: KLineData[], visibleRange: VisibleRange): void {
        this.currentData = data
        this.visibleRange = visibleRange
        this.dirtyData = true
        this.computeIfDirty()
    }

    /**
     * MA 配置变更时调用
     * @param config 新的 MA 配置（哪些周期启用）
     */
    updateMAConfig(config: MAFlags): void {
        this.maConfig = { ...config }
        this.dirtyData = true
        this.computeIfDirty()
    }

    /**
     * BOLL 配置变更时调用
     * @param config 新的 BOLL 配置
     */
    updateBOLLConfig(config: Partial<BOLLSchedulerConfig>): void {
        this.bollConfig = { ...this.bollConfig, ...config }
        this.dirtyBollConfig = true
        this.computeIfDirty()
    }

    /**
     * EXPMA 配置变更时调用
     * @param config 新的 EXPMA 配置
     */
    updateEXPMAConfig(config: Partial<EXPMASchedulerConfig>): void {
        this.expmaConfig = { ...this.expmaConfig, ...config }
        this.dirtyExpmaConfig = true
        this.computeIfDirty()
    }

    /**
     * ENE 配置变更时调用
     * @param config 新的 ENE 配置
     */
    updateENEConfig(config: Partial<ENESchedulerConfig>): void {
        this.eneConfig = { ...this.eneConfig, ...config }
        this.dirtyEneConfig = true
        this.computeIfDirty()
    }

    /**
     * 视口变更时调用
     * @param visibleRange 新的可见范围
     */
    updateVisibleRange(visibleRange: VisibleRange): void {
        this.visibleRange = visibleRange
        this.dirtyRange = true
        this.computeIfDirty()
    }

    /**
     * 强制全部重算
     */
    recompute(): void {
        this.dirtyData = true
        this.dirtyRange = true
        this.computeIfDirty()
    }

    /**
     * 根据脏标记执行计算
     *
     * 计算流程：
     * 1. 若 dirtyData 或指标配置脏标记，重算对应 series
     * 2. 若任一 series 重算或 dirtyRange，重算所有指标在视口内的极值
     * 3. 写入所有指标的 StateStore
     */
    private computeIfDirty(): void {
        if (!this.dirtyData && !this.dirtyRange &&
            !this.dirtyBollConfig && !this.dirtyExpmaConfig && !this.dirtyEneConfig) {
            return
        }
        if (!this.pluginHost) return

        const shouldRecomputeExtremes = this.dirtyData || this.dirtyRange ||
            this.dirtyBollConfig || this.dirtyExpmaConfig || this.dirtyEneConfig

        // ===== 步骤1：重算各指标 series =====

        // MA series（dirtyData 时重算）
        if (this.dirtyData) {
            this.cachedSeries = {}
            for (const period of DEFAULT_MA_PERIODS) {
                const flagKey = `ma${period}` as keyof MAFlags
                if (this.maConfig[flagKey]) {
                    this.cachedSeries[period] = calcMAData(this.currentData, period)
                }
            }
        }

        // BOLL series（dirtyData 或 dirtyBollConfig 时重算）
        if (this.dirtyData || this.dirtyBollConfig) {
            this.cachedBollSeries = calcBOLLData(
                this.currentData,
                this.bollConfig.period,
                this.bollConfig.multiplier
            )
        }

        // EXPMA series（dirtyData 或 dirtyExpmaConfig 时重算）
        if (this.dirtyData || this.dirtyExpmaConfig) {
            this.cachedExpmaSeries = calcEXPMAData(
                this.currentData,
                this.expmaConfig.fastPeriod,
                this.expmaConfig.slowPeriod
            )
        }

        // ENE series（dirtyData 或 dirtyEneConfig 时重算）
        if (this.dirtyData || this.dirtyEneConfig) {
            this.cachedEneSeries = calcENEData(
                this.currentData,
                this.eneConfig.period,
                this.eneConfig.deviation
            )
        }

        // ===== 步骤2：重算视口极值（所有指标）=====
        // MA 极值（dirtyData 或 dirtyRange 时重算）
        let maVisibleMin = Infinity
        let maVisibleMax = -Infinity
        if (this.dirtyData || this.dirtyRange) {
            for (const values of Object.values(this.cachedSeries)) {
                for (let i = this.visibleRange.start; i < this.visibleRange.end && i < values.length; i++) {
                    const v = values[i]
                    if (v !== undefined) {
                        maVisibleMin = Math.min(maVisibleMin, v)
                        maVisibleMax = Math.max(maVisibleMax, v)
                    }
                }
            }
        }

        // BOLL 极值（扫描 upper/middle/lower）
        let bollVisibleMin = Infinity
        let bollVisibleMax = -Infinity
        if (shouldRecomputeExtremes) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedBollSeries.length; i++) {
                const p = this.cachedBollSeries[i]
                if (p) {
                    bollVisibleMin = Math.min(bollVisibleMin, p.upper, p.middle, p.lower)
                    bollVisibleMax = Math.max(bollVisibleMax, p.upper, p.middle, p.lower)
                }
            }
        }

        // EXPMA 极值（扫描 fast/slow）
        let expmaVisibleMin = Infinity
        let expmaVisibleMax = -Infinity
        if (shouldRecomputeExtremes) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedExpmaSeries.length; i++) {
                const p = this.cachedExpmaSeries[i]
                if (p) {
                    expmaVisibleMin = Math.min(expmaVisibleMin, p.fast, p.slow)
                    expmaVisibleMax = Math.max(expmaVisibleMax, p.fast, p.slow)
                }
            }
        }

        // ENE 极值（扫描 upper/middle/lower）
        let eneVisibleMin = Infinity
        let eneVisibleMax = -Infinity
        if (shouldRecomputeExtremes) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedEneSeries.length; i++) {
                const p = this.cachedEneSeries[i]
                if (p) {
                    eneVisibleMin = Math.min(eneVisibleMin, p.upper, p.middle, p.lower)
                    eneVisibleMax = Math.max(eneVisibleMax, p.upper, p.middle, p.lower)
                }
            }
        }

        // ===== 步骤3：构建状态并写入 StateStore =====

        // MA State
        const enabledPeriods = Object.keys(this.cachedSeries).map(Number)
        const maState: MARenderState = {
            timestamp: Date.now(),
            series: { ...this.cachedSeries },
            enabledPeriods,
            visibleMin: maVisibleMin,
            visibleMax: maVisibleMax,
        }
        this.pluginHost.setSharedState<MARenderState>(MA_STATE_KEY, maState, 'ma_scheduler')

        // BOLL State
        const bollState: BOLLRenderState = {
            timestamp: Date.now(),
            series: this.cachedBollSeries,
            params: { ...this.bollConfig },
            visibleMin: bollVisibleMin,
            visibleMax: bollVisibleMax,
        }
        this.pluginHost.setSharedState<BOLLRenderState>(BOLL_STATE_KEY, bollState, 'indicator_scheduler')

        // EXPMA State
        const expmaState: EXPMARenderState = {
            timestamp: Date.now(),
            series: this.cachedExpmaSeries,
            params: { ...this.expmaConfig },
            visibleMin: expmaVisibleMin,
            visibleMax: expmaVisibleMax,
        }
        this.pluginHost.setSharedState<EXPMARenderState>(EXPMA_STATE_KEY, expmaState, 'indicator_scheduler')

        // ENE State
        const eneState: ENERenderState = {
            timestamp: Date.now(),
            series: this.cachedEneSeries,
            params: { ...this.eneConfig },
            visibleMin: eneVisibleMin,
            visibleMax: eneVisibleMax,
        }
        this.pluginHost.setSharedState<ENERenderState>(ENE_STATE_KEY, eneState, 'indicator_scheduler')

        // 重置脏标记
        this.dirtyData = false
        this.dirtyRange = false
        this.dirtyBollConfig = false
        this.dirtyExpmaConfig = false
        this.dirtyEneConfig = false
    }
}
