import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { EXPMA_COLORS } from '@/core/theme/colors'
import { EXPMA_STATE_KEY, type EXPMARenderState } from '@/core/indicators/expmaState'

/**
 * 创建 EXPMA（指数平滑移动平均线）渲染器插件（无状态版本）
 *
 * 设计原则：
 * 1. 不持有任何计算缓存或配置状态
 * 2. 所有数据从 StateStore 读取（通过 EXPMA_STATE_KEY）
 * 3. 配置变更通过外部 IndicatorScheduler 处理
 * 4. 纯绘制函数，无副作用
 */
export function createEXPMARendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null

    return {
        name: 'expma',
        version: '2.0.0',
        description: 'EXPMA 指数平滑移动平均线渲染器（无状态）',
        debugName: 'EXPMA',
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
         */
        getDeclaredNamespaces(): string[] {
            return [EXPMA_STATE_KEY]
        },

        /**
         * 绘制 EXPMA 线
         * 从 StateStore 读取预计算数据，仅执行绘制
         */
        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]

            // 从 StateStore 读取 EXPMA 状态
            const state = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)

            // 无有效数据时提前返回
            if (!state || state.visibleMin > state.visibleMax) return
            if (state.series.length === 0) return

            const expmaData = state.series

            if (klineData.length < 2) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const drawStart = range.start
            const drawEnd = Math.min(range.end, klineData.length)

            // 快线颜色（橙色）
            const fastColor = EXPMA_COLORS.FAST
            // 慢线颜色（蓝色）
            const slowColor = EXPMA_COLORS.SLOW

            const drawLine = (type: 'fast' | 'slow', color: string) => {
                ctx.strokeStyle = color
                ctx.lineWidth = 1
                ctx.lineJoin = 'round'
                ctx.lineCap = 'round'
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const expma = expmaData[i]
                    if (!expma) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.yAxis.priceToY(expma[type])
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

            drawLine('fast', fastColor)
            drawLine('slow', slowColor)

            ctx.restore()
        },

        /**
         * 获取配置（兼容性接口）
         * 从 StateStore 读取实际配置
         */
        getConfig() {
            const state = pluginHost?.getSharedState<EXPMARenderState>(EXPMA_STATE_KEY)
            return state ? { ...state.params } : {}
        },

        /**
         * 设置配置（兼容性接口，无实际操作）
         *
         * 重要：本渲染器为无状态设计，不持有配置。
         * 配置变更应通过外部控制器调用 IndicatorScheduler.updateEXPMAConfig() 完成。
         */
        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器不存储配置
            // 外部控制器应调用 chart.getIndicatorScheduler().updateEXPMAConfig()
        },
    }
}
