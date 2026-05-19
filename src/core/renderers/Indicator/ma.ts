import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import { MA_STATE_KEY, type MARenderState } from '@/core/indicators/maState'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { MA_COLORS } from '@/core/theme/colors'

// Re-export MAFlags from calculators for backward compatibility
export type { MAFlags } from '@/core/indicators/calculators'

/**
 * MA 周期到颜色的映射
 */
const MA_COLOR_MAP: Record<number, string> = {
    5: MA_COLORS.MA5,
    10: MA_COLORS.MA10,
    20: MA_COLORS.MA20,
    30: MA_COLORS.MA30,
    60: MA_COLORS.MA60,
}

/**
 * 绘制单条 MA 线
 */
function drawMALine(
    ctx: CanvasRenderingContext2D,
    maData: (number | undefined)[],
    context: RenderContext,
    color: string
) {
    const { pane, range, dpr, kLineCenters } = context

    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()

    let isFirst = true

    for (let i = range.start; i < range.end && i < maData.length; i++) {
        const maValue = maData[i]
        if (maValue === undefined) continue

        const centerX = kLineCenters[i - range.start]
        if (centerX === undefined) continue
        const logicY = pane.yAxis.priceToY(maValue)

        const x = centerX
        const y = alignToPhysicalPixelCenter(logicY, dpr)

        if (isFirst) {
            ctx.moveTo(x, y)
            isFirst = false
        } else {
            ctx.lineTo(x, y)
        }
    }

    ctx.stroke()
}

/**
 * 创建 MA 均线渲染器插件（无状态版本）
 *
 * 设计原则：
 * 1. 不持有任何计算缓存或配置状态
 * 2. 所有数据从 StateStore 读取（通过 MA_STATE_KEY）
 * 3. 配置变更通过外部 IndicatorScheduler 处理，不经过本渲染器
 * 4. 纯绘制函数，无副作用
 */
export function createMARendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null

    return {
        name: 'ma',
        version: '2.0.0',
        description: 'MA均线渲染器（无状态）',
        debugName: 'MA均线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.INDICATOR,

        /**
         * 安装时捕获 PluginHost 引用
         */
        onInstall(host: PluginHost): void {
            pluginHost = host
        },

        /**
         * 声明使用的 StateStore 命名空间
         * 框架在卸载时会自动清理这些命名空间
         */
        getDeclaredNamespaces(): string[] {
            return [MA_STATE_KEY]
        },

        /**
         * 绘制 MA 线
         * 从 StateStore 读取预计算数据，仅执行绘制
         */
        draw(context: RenderContext) {
            const { ctx, scrollLeft } = context

            // 从 StateStore 读取 MA 状态
            const state = pluginHost?.getSharedState<MARenderState>(MA_STATE_KEY)

            // 无有效数据时提前返回（visibleMin > visibleMax 表示空数据）
            if (!state || state.visibleMin > state.visibleMax) return

            // 无启用的周期时提前返回
            if (state.enabledPeriods.length === 0) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 绘制所有启用的 MA 线
            for (const [periodStr, values] of Object.entries(state.series)) {
                const period = Number(periodStr)
                const color = MA_COLOR_MAP[period] ?? MA_COLORS.MA5
                drawMALine(ctx, values, context, color)
            }

            ctx.restore()
        },

        /**
         * 获取配置（兼容性接口）
         * 返回空对象，实际配置由外部 IndicatorScheduler 管理
         */
        getConfig() {
            // 从 StateStore 读取当前启用的周期作为配置
            const state = pluginHost?.getSharedState<MARenderState>(MA_STATE_KEY)
            const config: Record<string, boolean> = {}
            state?.enabledPeriods.forEach(period => {
                config[`ma${period}`] = true
            })
            return config
        },

        /**
         * 设置配置（兼容性接口，无实际操作）
         *
         * 重要：本渲染器为无状态设计，不持有配置。
         * 配置变更应通过外部控制器调用 IndicatorScheduler.updateMAConfig() 完成。
         * 此处保留接口兼容性，但不更新任何内部状态。
         */
        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器不存储配置
            // 外部控制器应调用 chart.getIndicatorScheduler().updateMAConfig()
        },
    }
}
