import type { PluginHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import {
    calcMAData,
    calcBOLLData,
    calcEXPMAData,
    calcENEData,
    calcCCIData,
    calcSTOCHData,
    calcMOMData,
    calcWMSRData,
    calcKSTData,
    calcFASTKData,
} from './calculators'
import type {
    MAFlags,
    BOLLPoint,
    EXPMAPoint,
    ENEPoint,
    STOCHPoint,
    KSTPoint,
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
import { calcRSIData } from './calculators'
import type { RSIRenderState } from './rsiState'
import { createRSIStateKey } from './rsiState'
import type { CCIRenderState } from './cciState'
import { createCCIStateKey } from './cciState'
import type { STOCHRenderState } from './stochState'
import { createSTOCHStateKey } from './stochState'
import type { MOMRenderState } from './momState'
import { createMOMStateKey } from './momState'
import type { WMSRRenderState } from './wmsrState'
import { createWMSRStateKey } from './wmsrState'
import type { KSTRenderState } from './kstState'
import { createKSTStateKey } from './kstState'
import type { FASTKRenderState } from './fastkState'
import { createFASTKStateKey } from './fastkState'

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
 * RSI 调度器配置
 */
export interface RSISchedulerConfig {
    period1: number
    period2: number
    period3: number
    showRSI1: boolean
    showRSI2: boolean
    showRSI3: boolean
}

/**
 * CCI 调度器配置
 */
export interface CCISchedulerConfig {
    period: number
    showCCI: boolean
}

/**
 * STOCH 调度器配置
 */
export interface STOCHSchedulerConfig {
    n: number
    m: number
    showK: boolean
    showD: boolean
}

/**
 * MOM 调度器配置
 */
export interface MOMSchedulerConfig {
    period: number
    showMOM: boolean
}

/**
 * WMSR 调度器配置
 */
export interface WMSRSchedulerConfig {
    period: number
    showWMSR: boolean
}

/**
 * KST 调度器配置
 */
export interface KSTSchedulerConfig {
    roc1: number
    roc2: number
    roc3: number
    roc4: number
    signalPeriod: number
    showKST: boolean
    showSignal: boolean
}

/**
 * FASTK 调度器配置
 */
export interface FASTKSchedulerConfig {
    period: number
    showFASTK: boolean
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

    // RSI 配置和缓存
    private rsiConfig: RSISchedulerConfig = {
        period1: 6,
        period2: 12,
        period3: 24,
        showRSI1: true,
        showRSI2: true,
        showRSI3: true,
    }
    private rsiPaneId: string = 'sub_RSI'
    private cachedRsiSeries: Record<number, (number | undefined)[]> = {}

    // CCI 配置和缓存
    private cciConfig: CCISchedulerConfig = { period: 14, showCCI: true }
    private cciPaneId: string = 'sub_CCI'
    private cachedCciSeries: (number | undefined)[] = []

    // STOCH 配置和缓存
    private stochConfig: STOCHSchedulerConfig = { n: 9, m: 3, showK: true, showD: true }
    private stochPaneId: string = 'sub_STOCH'
    private cachedStochSeries: STOCHPoint[] = []

    // MOM 配置和缓存
    private momConfig: MOMSchedulerConfig = { period: 10, showMOM: true }
    private momPaneId: string = 'sub_MOM'
    private cachedMomSeries: (number | undefined)[] = []

    // WMSR 配置和缓存
    private wmsrConfig: WMSRSchedulerConfig = { period: 14, showWMSR: true }
    private wmsrPaneId: string = 'sub_WMSR'
    private cachedWmsrSeries: (number | undefined)[] = []

    // KST 配置和缓存
    private kstConfig: KSTSchedulerConfig = {
        roc1: 10,
        roc2: 15,
        roc3: 20,
        roc4: 30,
        signalPeriod: 9,
        showKST: true,
        showSignal: true,
    }
    private kstPaneId: string = 'sub_KST'
    private cachedKstSeries: KSTPoint[] = []

    // FASTK 配置和缓存
    private fastkConfig: FASTKSchedulerConfig = { period: 9, showFASTK: true }
    private fastkPaneId: string = 'sub_FASTK'
    private cachedFastkSeries: (number | undefined)[] = []

    // 双脏标记（数据/视口）
    private dirtyData = true   // 数据变更 → 重算所有 series + 极值
    private dirtyRange = true  // 仅视口变更 → 仅重算极值

    // 各指标配置脏标记（配置变更时仅重算该指标）
    private dirtyBollConfig = true
    private dirtyExpmaConfig = true
    private dirtyEneConfig = true
    private dirtyRsiConfig = true
    private dirtyCciConfig = true
    private dirtyStochConfig = true
    private dirtyMomConfig = true
    private dirtyWmsrConfig = true
    private dirtyKstConfig = true
    private dirtyFastkConfig = true

    // 各指标 state 脏标记（series 或极值重算时置位，控制 state 写入）
    private dirtyRsiState = true
    private dirtyCciState = true
    private dirtyStochState = true
    private dirtyMomState = true
    private dirtyWmsrState = true
    private dirtyKstState = true
    private dirtyFastkState = true

    /** 当前激活的主图指标列表 */
    private activeMainIndicators: Set<string> = new Set()

    /**
     * 设置 PluginHost，用于读写 StateStore
     */
    setPluginHost(host: PluginHost): void {
        this.pluginHost = host
    }

    /**
     * 设置当前激活的主图指标（用于极值计算过滤）
     * @param indicators 激活的指标ID列表，如 ['ma', 'boll', 'expma', 'ene']
     */
    setActiveMainIndicators(indicators: string[]): void {
        this.activeMainIndicators = new Set(indicators.map(i => i.toLowerCase()))
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
     * RSI 配置变更时调用
     * @param config 新的 RSI 配置
     * @param paneId RSI pane ID（可选，默认 'sub_RSI'）
     */
    updateRSIConfig(config: Partial<RSISchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.rsiPaneId = paneId
        }
        this.rsiConfig = { ...this.rsiConfig, ...config }
        this.dirtyRsiConfig = true
        this.computeIfDirty()
    }

    /**
     * CCI 配置变更时调用
     * @param config 新的 CCI 配置
     * @param paneId CCI pane ID（可选，默认 'sub_CCI'）
     */
    updateCCIConfig(config: Partial<CCISchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.cciPaneId = paneId
        }
        this.cciConfig = { ...this.cciConfig, ...config }
        this.dirtyCciConfig = true
        this.computeIfDirty()
    }

    /**
     * STOCH 配置变更时调用
     * @param config 新的 STOCH 配置
     * @param paneId STOCH pane ID（可选，默认 'sub_STOCH'）
     */
    updateSTOCHConfig(config: Partial<STOCHSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.stochPaneId = paneId
        }
        this.stochConfig = { ...this.stochConfig, ...config }
        this.dirtyStochConfig = true
        this.computeIfDirty()
    }

    /**
     * MOM 配置变更时调用
     * @param config 新的 MOM 配置
     * @param paneId MOM pane ID（可选，默认 'sub_MOM'）
     */
    updateMOMConfig(config: Partial<MOMSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.momPaneId = paneId
        }
        this.momConfig = { ...this.momConfig, ...config }
        this.dirtyMomConfig = true
        this.computeIfDirty()
    }

    /**
     * WMSR 配置变更时调用
     * @param config 新的 WMSR 配置
     * @param paneId WMSR pane ID（可选，默认 'sub_WMSR'）
     */
    updateWMSRConfig(config: Partial<WMSRSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.wmsrPaneId = paneId
        }
        this.wmsrConfig = { ...this.wmsrConfig, ...config }
        this.dirtyWmsrConfig = true
        this.computeIfDirty()
    }

    /**
     * KST 配置变更时调用
     * @param config 新的 KST 配置
     * @param paneId KST pane ID（可选，默认 'sub_KST'）
     */
    updateKSTConfig(config: Partial<KSTSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.kstPaneId = paneId
        }
        this.kstConfig = { ...this.kstConfig, ...config }
        this.dirtyKstConfig = true
        this.computeIfDirty()
    }

    /**
     * FASTK 配置变更时调用
     * @param config 新的 FASTK 配置
     * @param paneId FASTK pane ID（可选，默认 'sub_FASTK'）
     */
    updateFASTKConfig(config: Partial<FASTKSchedulerConfig>, paneId?: string): void {
        if (paneId !== undefined) {
            this.fastkPaneId = paneId
        }
        this.fastkConfig = { ...this.fastkConfig, ...config }
        this.dirtyFastkConfig = true
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
            !this.dirtyBollConfig && !this.dirtyExpmaConfig && !this.dirtyEneConfig && !this.dirtyRsiConfig &&
            !this.dirtyCciConfig && !this.dirtyStochConfig && !this.dirtyMomConfig && !this.dirtyWmsrConfig && !this.dirtyKstConfig && !this.dirtyFastkConfig) {
            return
        }
        if (!this.pluginHost) return

// 各指标独立的极值守卫条件，避免一脏全算

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

        // RSI series（dirtyData 或 dirtyRsiConfig 时重算）
        if (this.dirtyData || this.dirtyRsiConfig) {
            this.cachedRsiSeries = {}
            const periods = [this.rsiConfig.period1, this.rsiConfig.period2, this.rsiConfig.period3]
            const shows = [this.rsiConfig.showRSI1, this.rsiConfig.showRSI2, this.rsiConfig.showRSI3]
            for (let i = 0; i < periods.length; i++) {
                if (shows[i]) {
                    this.cachedRsiSeries[periods[i]] = calcRSIData(this.currentData, periods[i])
                }
            }
        }

        // CCI series（dirtyData 或 dirtyCciConfig 时重算）
        if (this.dirtyData || this.dirtyCciConfig) {
            if (this.cciConfig.showCCI) {
                this.cachedCciSeries = calcCCIData(this.currentData, this.cciConfig.period)
            } else {
                this.cachedCciSeries = []
            }
        }

        // STOCH series（dirtyData 或 dirtyStochConfig 时重算）
        if (this.dirtyData || this.dirtyStochConfig) {
            if (this.stochConfig.showK || this.stochConfig.showD) {
                this.cachedStochSeries = calcSTOCHData(this.currentData, this.stochConfig.n, this.stochConfig.m)
            } else {
                this.cachedStochSeries = []
            }
        }

        // MOM series（dirtyData 或 dirtyMomConfig 时重算）
        if (this.dirtyData || this.dirtyMomConfig) {
            if (this.momConfig.showMOM) {
                this.cachedMomSeries = calcMOMData(this.currentData, this.momConfig.period)
            } else {
                this.cachedMomSeries = []
            }
        }

        // WMSR series（dirtyData 或 dirtyWmsrConfig 时重算）
        if (this.dirtyData || this.dirtyWmsrConfig) {
            if (this.wmsrConfig.showWMSR) {
                this.cachedWmsrSeries = calcWMSRData(this.currentData, this.wmsrConfig.period)
            } else {
                this.cachedWmsrSeries = []
            }
        }

        // KST series（dirtyData 或 dirtyKstConfig 时重算）
        if (this.dirtyData || this.dirtyKstConfig) {
            if (this.kstConfig.showKST || this.kstConfig.showSignal) {
                this.cachedKstSeries = calcKSTData(
                    this.currentData,
                    this.kstConfig.roc1,
                    this.kstConfig.roc2,
                    this.kstConfig.roc3,
                    this.kstConfig.roc4,
                    this.kstConfig.signalPeriod
                )
            } else {
                this.cachedKstSeries = []
            }
        }

        // FASTK series（dirtyData 或 dirtyFastkConfig 时重算）
        if (this.dirtyData || this.dirtyFastkConfig) {
            if (this.fastkConfig.showFASTK) {
                this.cachedFastkSeries = calcFASTKData(this.currentData, this.fastkConfig.period)
            } else {
                this.cachedFastkSeries = []
            }
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
        const dirtyBollState = this.dirtyData || this.dirtyRange || this.dirtyBollConfig
        if (dirtyBollState) {
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
        const dirtyExpmaState = this.dirtyData || this.dirtyRange || this.dirtyExpmaConfig
        if (dirtyExpmaState) {
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
        const dirtyEneState = this.dirtyData || this.dirtyRange || this.dirtyEneConfig
        if (dirtyEneState) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedEneSeries.length; i++) {
                const p = this.cachedEneSeries[i]
                if (p) {
                    eneVisibleMin = Math.min(eneVisibleMin, p.upper, p.middle, p.lower)
                    eneVisibleMax = Math.max(eneVisibleMax, p.upper, p.middle, p.lower)
                }
            }
        }

        // RSI 极值（扫描所有启用的周期）
        let rsiVisibleMin = Infinity
        let rsiVisibleMax = -Infinity
        this.dirtyRsiState = this.dirtyData || this.dirtyRange || this.dirtyRsiConfig
        if (this.dirtyRsiState) {
            for (const values of Object.values(this.cachedRsiSeries)) {
                for (let i = this.visibleRange.start; i < this.visibleRange.end && i < values.length; i++) {
                    const v = values[i]
                    if (v !== undefined) {
                        rsiVisibleMin = Math.min(rsiVisibleMin, v)
                        rsiVisibleMax = Math.max(rsiVisibleMax, v)
                    }
                }
            }
        }

        // CCI 极值
        let cciVisibleMin = Infinity
        let cciVisibleMax = -Infinity
        this.dirtyCciState = this.dirtyData || this.dirtyRange || this.dirtyCciConfig
        if (this.dirtyCciState) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedCciSeries.length; i++) {
                const v = this.cachedCciSeries[i]
                if (v !== undefined) {
                    cciVisibleMin = Math.min(cciVisibleMin, v)
                    cciVisibleMax = Math.max(cciVisibleMax, v)
                }
            }
        }

        // STOCH 极值（扫描 k 和 d）
        let stochVisibleMin = Infinity
        let stochVisibleMax = -Infinity
        this.dirtyStochState = this.dirtyData || this.dirtyRange || this.dirtyStochConfig
        if (this.dirtyStochState) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedStochSeries.length; i++) {
                const p = this.cachedStochSeries[i]
                if (p) {
                    stochVisibleMin = Math.min(stochVisibleMin, p.k, p.d)
                    stochVisibleMax = Math.max(stochVisibleMax, p.k, p.d)
                }
            }
        }

        // MOM 极值
        let momVisibleMin = Infinity
        let momVisibleMax = -Infinity
        this.dirtyMomState = this.dirtyData || this.dirtyRange || this.dirtyMomConfig
        if (this.dirtyMomState) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedMomSeries.length; i++) {
                const v = this.cachedMomSeries[i]
                if (v !== undefined) {
                    momVisibleMin = Math.min(momVisibleMin, v)
                    momVisibleMax = Math.max(momVisibleMax, v)
                }
            }
        }

        // WMSR 极值
        let wmsrVisibleMin = Infinity
        let wmsrVisibleMax = -Infinity
        this.dirtyWmsrState = this.dirtyData || this.dirtyRange || this.dirtyWmsrConfig
        if (this.dirtyWmsrState) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedWmsrSeries.length; i++) {
                const v = this.cachedWmsrSeries[i]
                if (v !== undefined) {
                    wmsrVisibleMin = Math.min(wmsrVisibleMin, v)
                    wmsrVisibleMax = Math.max(wmsrVisibleMax, v)
                }
            }
        }

        // KST 极值（扫描 kst 和 signal）
        let kstVisibleMin = Infinity
        let kstVisibleMax = -Infinity
        this.dirtyKstState = this.dirtyData || this.dirtyRange || this.dirtyKstConfig
        if (this.dirtyKstState) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedKstSeries.length; i++) {
                const p = this.cachedKstSeries[i]
                if (p) {
                    kstVisibleMin = Math.min(kstVisibleMin, p.kst, p.signal)
                    kstVisibleMax = Math.max(kstVisibleMax, p.kst, p.signal)
                }
            }
        }

        // FASTK 极值
        let fastkVisibleMin = Infinity
        let fastkVisibleMax = -Infinity
        this.dirtyFastkState = this.dirtyData || this.dirtyRange || this.dirtyFastkConfig
        if (this.dirtyFastkState) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < this.cachedFastkSeries.length; i++) {
                const v = this.cachedFastkSeries[i]
                if (v !== undefined) {
                    fastkVisibleMin = Math.min(fastkVisibleMin, v)
                    fastkVisibleMax = Math.max(fastkVisibleMax, v)
                }
            }
        }

        // ===== 步骤3：构建状态并写入 StateStore =====

        // MA State（dirtyData 或 dirtyRange 时写入）
        if (this.dirtyData || this.dirtyRange) {
            const enabledPeriods = Object.keys(this.cachedSeries).map(Number)
            const maState: MARenderState = {
                timestamp: Date.now(),
                series: this.cachedSeries,
                enabledPeriods,
                visibleMin: maVisibleMin,
                visibleMax: maVisibleMax,
            }
            this.pluginHost.setSharedState<MARenderState>(MA_STATE_KEY, maState, 'ma_scheduler')
        }

        // BOLL State
        if (dirtyBollState) {
            const bollState: BOLLRenderState = {
                timestamp: Date.now(),
                series: this.cachedBollSeries,
                params: this.bollConfig,
                visibleMin: bollVisibleMin,
                visibleMax: bollVisibleMax,
            }
            this.pluginHost.setSharedState<BOLLRenderState>(BOLL_STATE_KEY, bollState, 'indicator_scheduler')
        }

        // EXPMA State
        if (dirtyExpmaState) {
            const expmaState: EXPMARenderState = {
                timestamp: Date.now(),
                series: this.cachedExpmaSeries,
                params: this.expmaConfig,
                visibleMin: expmaVisibleMin,
                visibleMax: expmaVisibleMax,
            }
            this.pluginHost.setSharedState<EXPMARenderState>(EXPMA_STATE_KEY, expmaState, 'indicator_scheduler')
        }

        // ENE State
        if (dirtyEneState) {
            const eneState: ENERenderState = {
                timestamp: Date.now(),
                series: this.cachedEneSeries,
                params: this.eneConfig,
                visibleMin: eneVisibleMin,
                visibleMax: eneVisibleMax,
            }
            this.pluginHost.setSharedState<ENERenderState>(ENE_STATE_KEY, eneState, 'indicator_scheduler')
        }

        // RSI State（仅 dirtyRsiState 时写入）
        if (this.dirtyRsiState) {
            const rsiStateKey = createRSIStateKey(this.rsiPaneId)
            const rsiEnabledPeriods = Object.keys(this.cachedRsiSeries).map(Number)
            const rsiState: RSIRenderState = {
                timestamp: Date.now(),
                series: this.cachedRsiSeries,
                enabledPeriods: rsiEnabledPeriods,
                params: this.rsiConfig,
                valueMin: 0,
                valueMax: 100,
                visibleMin: rsiVisibleMin,
                visibleMax: rsiVisibleMax,
            }
            this.pluginHost.setSharedState<RSIRenderState>(rsiStateKey, rsiState, 'indicator_scheduler')
        }

        // CCI State（仅 dirtyCciState 时写入）
        if (this.dirtyCciState) {
            const cciStateKey = createCCIStateKey(this.cciPaneId)
            const cciValueMin = Math.min(cciVisibleMin, -150)
            const cciValueMax = Math.max(cciVisibleMax, 150)
            const cciState: CCIRenderState = {
                timestamp: Date.now(),
                series: this.cachedCciSeries,
                params: this.cciConfig,
                valueMin: cciValueMin,
                valueMax: cciValueMax,
                visibleMin: cciVisibleMin,
                visibleMax: cciVisibleMax,
            }
            this.pluginHost.setSharedState<CCIRenderState>(cciStateKey, cciState, 'indicator_scheduler')
        }

        // STOCH State（仅 dirtyStochState 时写入）
        if (this.dirtyStochState) {
            const stochStateKey = createSTOCHStateKey(this.stochPaneId)
            const stochState: STOCHRenderState = {
                timestamp: Date.now(),
                series: this.cachedStochSeries,
                params: this.stochConfig,
                valueMin: 0,
                valueMax: 100,
                visibleMin: stochVisibleMin,
                visibleMax: stochVisibleMax,
            }
            this.pluginHost.setSharedState<STOCHRenderState>(stochStateKey, stochState, 'indicator_scheduler')
        }

        // MOM State（仅 dirtyMomState 时写入）
        if (this.dirtyMomState) {
            const momStateKey = createMOMStateKey(this.momPaneId)
            const momPadding = Math.max(Math.abs(momVisibleMax), Math.abs(momVisibleMin)) * 0.1
            const momValueMin = momVisibleMin - momPadding
            const momValueMax = momVisibleMax + momPadding
            const momState: MOMRenderState = {
                timestamp: Date.now(),
                series: this.cachedMomSeries,
                params: this.momConfig,
                valueMin: momValueMin,
                valueMax: momValueMax,
                visibleMin: momVisibleMin,
                visibleMax: momVisibleMax,
            }
            this.pluginHost.setSharedState<MOMRenderState>(momStateKey, momState, 'indicator_scheduler')
        }

        // WMSR State（仅 dirtyWmsrState 时写入）
        if (this.dirtyWmsrState) {
            const wmsrStateKey = createWMSRStateKey(this.wmsrPaneId)
            const wmsrState: WMSRRenderState = {
                timestamp: Date.now(),
                series: this.cachedWmsrSeries,
                params: this.wmsrConfig,
                valueMin: -100,
                valueMax: 0,
                visibleMin: wmsrVisibleMin,
                visibleMax: wmsrVisibleMax,
            }
            this.pluginHost.setSharedState<WMSRRenderState>(wmsrStateKey, wmsrState, 'indicator_scheduler')
        }

        // KST State（仅 dirtyKstState 时写入）
        if (this.dirtyKstState) {
            const kstStateKey = createKSTStateKey(this.kstPaneId)
            const kstRange = kstVisibleMax - kstVisibleMin
            const kstPadding = kstRange * 0.1
            const kstValueMin = kstVisibleMin - kstPadding
            const kstValueMax = kstVisibleMax + kstPadding
            const kstState: KSTRenderState = {
                timestamp: Date.now(),
                series: this.cachedKstSeries,
                params: this.kstConfig,
                valueMin: kstValueMin,
                valueMax: kstValueMax,
                visibleMin: kstVisibleMin,
                visibleMax: kstVisibleMax,
            }
            this.pluginHost.setSharedState<KSTRenderState>(kstStateKey, kstState, 'indicator_scheduler')
        }

        // FASTK State（仅 dirtyFastkState 时写入）
        if (this.dirtyFastkState) {
            const fastkStateKey = createFASTKStateKey(this.fastkPaneId)
            const fastkState: FASTKRenderState = {
                timestamp: Date.now(),
                series: this.cachedFastkSeries,
                params: this.fastkConfig,
                valueMin: 0,
                valueMax: 100,
                visibleMin: fastkVisibleMin,
                visibleMax: fastkVisibleMax,
            }
            this.pluginHost.setSharedState<FASTKRenderState>(fastkStateKey, fastkState, 'indicator_scheduler')
        }

        // 重置脏标记
        this.dirtyData = false
        this.dirtyRange = false
        this.dirtyBollConfig = false
        this.dirtyExpmaConfig = false
        this.dirtyEneConfig = false
        this.dirtyRsiConfig = false
        this.dirtyCciConfig = false
        this.dirtyStochConfig = false
        this.dirtyMomConfig = false
        this.dirtyWmsrConfig = false
        this.dirtyKstConfig = false
        this.dirtyFastkConfig = false

        // 重置 state 脏标记
        this.dirtyRsiState = false
        this.dirtyCciState = false
        this.dirtyStochState = false
        this.dirtyMomState = false
        this.dirtyWmsrState = false
        this.dirtyKstState = false
        this.dirtyFastkState = false
    }

    /**
     * 获取主图指标极值（用于与K线极值合并计算价格轴范围）
     * @returns 主图指标的价格范围，无指标时返回 null
     */
    getMainIndicatorPriceRange(): { min: number; max: number } | null {
        let min = Infinity
        let max = -Infinity
        const { start, end } = this.visibleRange

        // MA极值（仅当MA被激活时计算）
        if (this.activeMainIndicators.has('ma') && Object.keys(this.cachedSeries).length > 0) {
            for (const values of Object.values(this.cachedSeries)) {
                for (let i = start; i < end && i < values.length; i++) {
                    const v = values[i]
                    if (v !== undefined) {
                        min = Math.min(min, v)
                        max = Math.max(max, v)
                    }
                }
            }
        }

        // BOLL极值（仅当BOLL被激活时计算）
        if (this.activeMainIndicators.has('boll') && this.cachedBollSeries.length > 0) {
            for (let i = start; i < end && i < this.cachedBollSeries.length; i++) {
                const p = this.cachedBollSeries[i]
                if (p) {
                    min = Math.min(min, p.upper, p.middle, p.lower)
                    max = Math.max(max, p.upper, p.middle, p.lower)
                }
            }
        }

        // EXPMA极值（仅当EXPMA被激活时计算）
        if (this.activeMainIndicators.has('expma') && this.cachedExpmaSeries.length > 0) {
            for (let i = start; i < end && i < this.cachedExpmaSeries.length; i++) {
                const p = this.cachedExpmaSeries[i]
                if (p) {
                    min = Math.min(min, p.fast, p.slow)
                    max = Math.max(max, p.fast, p.slow)
                }
            }
        }

        // ENE极值（仅当ENE被激活时计算）
        if (this.activeMainIndicators.has('ene') && this.cachedEneSeries.length > 0) {
            for (let i = start; i < end && i < this.cachedEneSeries.length; i++) {
                const p = this.cachedEneSeries[i]
                if (p) {
                    min = Math.min(min, p.upper, p.middle, p.lower)
                    max = Math.max(max, p.upper, p.middle, p.lower)
                }
            }
        }

        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return null
        }

        return { min, max }
    }
}
