import type { PluginHost } from '@/plugin'
import type { KLineData } from '@/types/price'
import { calcMAData } from './calculators'
import type { MAFlags } from './calculators'
import { DEFAULT_MA_PERIODS } from './calculators'
import type { MARenderState } from './maState'
import { MA_STATE_KEY } from './maState'

/**
 * 可见范围
 */
interface VisibleRange {
    start: number
    end: number
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

    // 缓存已计算的 series，视口变更时复用
    private cachedSeries: Record<number, (number | undefined)[]> = {}

    // 双脏标记
    private dirtyData = true   // 数据或配置变更 → 重算 series + 极值
    private dirtyRange = true  // 仅视口变更 → 仅重算极值

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
     * 1. 若 dirtyData，重算所有启用周期的 series（O(n) 滑动窗口）
     * 2. 若 dirtyData 或 dirtyRange，重算可见范围内的极值（O(periods × visibleCount)）
     * 3. 写入 StateStore
     */
    private computeIfDirty(): void {
        if (!this.dirtyData && !this.dirtyRange) return
        if (!this.pluginHost) return

        // 步骤1：重算 series（仅当数据或配置变更时）
        if (this.dirtyData) {
            this.cachedSeries = {}
            for (const period of DEFAULT_MA_PERIODS) {
                const flagKey = `ma${period}` as keyof MAFlags
                if (this.maConfig[flagKey]) {
                    this.cachedSeries[period] = calcMAData(this.currentData, period)
                }
            }
        }

        // 步骤2：重算视口极值（dirtyData 或 dirtyRange 都需要）
        // 复杂度：O(periods × visibleCount)
        // 未来优化：可改为 segment tree 实现 O(log n) 区间极值查询
        let visibleMin = Infinity
        let visibleMax = -Infinity

        for (const [periodStr, values] of Object.entries(this.cachedSeries)) {
            for (let i = this.visibleRange.start; i < this.visibleRange.end && i < values.length; i++) {
                const v = values[i]
                if (v !== undefined) {
                    visibleMin = Math.min(visibleMin, v)
                    visibleMax = Math.max(visibleMax, v)
                }
            }
        }

        // 步骤3：构建状态并写入 StateStore
        const enabledPeriods = Object.keys(this.cachedSeries).map(Number)

        const state: MARenderState = {
            timestamp: Date.now(),
            series: { ...this.cachedSeries },  // 浅拷贝，避免外部修改缓存
            enabledPeriods,
            visibleMin,
            visibleMax,
        }

        this.pluginHost.setSharedState<MARenderState>(MA_STATE_KEY, state, 'ma_scheduler')

        this.dirtyData = false
        this.dirtyRange = false
    }
}
