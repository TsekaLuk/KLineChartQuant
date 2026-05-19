import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { ENE_COLORS } from '@/core/theme/colors'
import { ENE_STATE_KEY, type ENERenderState } from '@/core/indicators/eneState'

/**
 * 创建 ENE（轨道线）渲染器插件（无状态版本）
 *
 * 设计原则：
 * 1. 不持有任何计算缓存或配置状态
 * 2. 所有数据从 StateStore 读取（通过 ENE_STATE_KEY）
 * 3. 配置变更通过外部 IndicatorScheduler 处理
 * 4. 纯绘制函数，无副作用
 */
export function createENERendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null

    return {
        name: 'ene',
        version: '2.0.0',
        description: 'ENE 轨道线渲染器（无状态）',
        debugName: 'ENE轨道线',
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
            return [ENE_STATE_KEY]
        },

        /**
         * 绘制 ENE 线
         * 从 StateStore 读取预计算数据，仅执行绘制
         */
        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]

            // 从 StateStore 读取 ENE 状态
            const state = pluginHost?.getSharedState<ENERenderState>(ENE_STATE_KEY)

            // 无有效数据时提前返回
            if (!state || state.visibleMin > state.visibleMax) return
            if (state.series.length === 0) return

            const { period } = state.params
            const eneData = state.series

            if (klineData.length < period) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const drawStart = Math.max(range.start, period - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            // 使用主题颜色（修复：原代码硬编码颜色）
            const upperColor = ENE_COLORS.UPPER
            const middleColor = ENE_COLORS.MIDDLE
            const lowerColor = ENE_COLORS.LOWER
            const bandFill = ENE_COLORS.BAND_FILL

            // 绘制带状区域
            ctx.fillStyle = bandFill
            ctx.beginPath()
            let isFirst = true

            // 上轨
            for (let i = drawStart; i < drawEnd; i++) {
                const ene = eneData[i]
                if (!ene) continue

                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const logicY = pane.yAxis.priceToY(ene.upper)
                const x = centerX
                const y = alignToPhysicalPixelCenter(logicY, dpr)

                if (isFirst) {
                    ctx.moveTo(x, y)
                    isFirst = false
                } else {
                    ctx.lineTo(x, y)
                }
            }

            // 下轨（反向）
            for (let i = drawEnd - 1; i >= drawStart; i--) {
                const ene = eneData[i]
                if (!ene) continue

                const centerX = kLineCenters[i - range.start]
                if (centerX === undefined) continue
                const logicY = pane.yAxis.priceToY(ene.lower)
                const x = centerX
                const y = alignToPhysicalPixelCenter(logicY, dpr)

                ctx.lineTo(x, y)
            }

            ctx.closePath()
            ctx.fill()

            // 绘制线条
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const drawLine = (type: 'upper' | 'middle' | 'lower', color: string) => {
                ctx.strokeStyle = color
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const ene = eneData[i]
                    if (!ene) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.yAxis.priceToY(ene[type])
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

            drawLine('upper', upperColor)
            drawLine('middle', middleColor)
            drawLine('lower', lowerColor)

            ctx.restore()
        },

        /**
         * 获取配置（兼容性接口）
         * 从 StateStore 读取实际配置
         */
        getConfig() {
            const state = pluginHost?.getSharedState<ENERenderState>(ENE_STATE_KEY)
            return state ? { ...state.params } : {}
        },

        /**
         * 设置配置（兼容性接口，无实际操作）
         *
         * 重要：本渲染器为无状态设计，不持有配置。
         * 配置变更应通过外部控制器调用 IndicatorScheduler.updateENEConfig() 完成。
         */
        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器不存储配置
            // 外部控制器应调用 chart.getIndicatorScheduler().updateENEConfig()
        },
    }
}
