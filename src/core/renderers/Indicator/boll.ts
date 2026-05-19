import type { RendererPluginWithHost, PluginHost, RenderContext } from '@/plugin'
import { RENDERER_PRIORITY } from '@/plugin'
import type { KLineData } from '@/types/price'
import { alignToPhysicalPixelCenter } from '@/core/draw/pixelAlign'
import { BOLL_COLORS } from '@/core/theme/colors'
import { BOLL_STATE_KEY, type BOLLRenderState } from '@/core/indicators/bollState'

/**
 * 创建 BOLL（布林带）渲染器插件（无状态版本）
 *
 * 设计原则：
 * 1. 不持有任何计算缓存或配置状态
 * 2. 所有数据从 StateStore 读取（通过 BOLL_STATE_KEY）
 * 3. 配置变更通过外部 IndicatorScheduler 处理
 * 4. 纯绘制函数，无副作用
 */
export function createBOLLRendererPlugin(): RendererPluginWithHost {
    let pluginHost: PluginHost | null = null

    return {
        name: 'boll',
        version: '2.0.0',
        description: '布林带渲染器（无状态）',
        debugName: 'BOLL布林带',
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
            return [BOLL_STATE_KEY]
        },

        /**
         * 绘制 BOLL 线
         * 从 StateStore 读取预计算数据，仅执行绘制
         */
        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters } = context
            const klineData = data as KLineData[]

            // 从 StateStore 读取 BOLL 状态
            const state = pluginHost?.getSharedState<BOLLRenderState>(BOLL_STATE_KEY)

            // 无有效数据时提前返回
            if (!state || state.visibleMin > state.visibleMax) return
            if (state.series.length === 0) return

            const { period, showUpper, showMiddle, showLower, showBand } = state.params
            const bollData = state.series

            if (klineData.length < period) return

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            const drawStart = Math.max(range.start, period - 1)
            const drawEnd = Math.min(range.end, klineData.length)

            // 绘制带状区域
            if (showBand) {
                ctx.fillStyle = BOLL_COLORS.BAND_FILL
                ctx.beginPath()
                let isFirst = true

                // 上轨
                for (let i = drawStart; i < drawEnd; i++) {
                    const boll = bollData[i]
                    if (!boll) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.yAxis.priceToY(boll.upper)
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
                    const boll = bollData[i]
                    if (!boll) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.yAxis.priceToY(boll.lower)
                    const x = centerX
                    const y = alignToPhysicalPixelCenter(logicY, dpr)

                    ctx.lineTo(x, y)
                }

                ctx.closePath()
                ctx.fill()
            }

            // 绘制线条
            ctx.lineWidth = 1
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            const drawLine = (type: 'upper' | 'middle' | 'lower', color: string) => {
                ctx.strokeStyle = color
                ctx.beginPath()
                let isFirst = true

                for (let i = drawStart; i < drawEnd; i++) {
                    const boll = bollData[i]
                    if (!boll) continue

                    const centerX = kLineCenters[i - range.start]
                    if (centerX === undefined) continue
                    const logicY = pane.yAxis.priceToY(boll[type])
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

            if (showUpper) drawLine('upper', BOLL_COLORS.UPPER)
            if (showMiddle) drawLine('middle', BOLL_COLORS.MIDDLE)
            if (showLower) drawLine('lower', BOLL_COLORS.LOWER)

            ctx.restore()
        },

        /**
         * 获取配置（兼容性接口）
         * 从 StateStore 读取实际配置
         */
        getConfig() {
            const state = pluginHost?.getSharedState<BOLLRenderState>(BOLL_STATE_KEY)
            return state ? { ...state.params } : {}
        },

        /**
         * 设置配置（兼容性接口，无实际操作）
         *
         * 重要：本渲染器为无状态设计，不持有配置。
         * 配置变更应通过外部控制器调用 IndicatorScheduler.updateBOLLConfig() 完成。
         */
        setConfig(_newConfig: Record<string, unknown>) {
            // 无状态渲染器不存储配置
            // 外部控制器应调用 chart.getIndicatorScheduler().updateBOLLConfig()
        },
    }
}
