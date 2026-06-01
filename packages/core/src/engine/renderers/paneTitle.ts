import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import { getColors } from '../theme/colors'
import { getFont, setCanvasFont } from '../theme/fonts'

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 256

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
    const key = `${ctx.font}\n${text}`
    const cached = textWidthCache.get(key)
    if (cached !== undefined) {
        return cached
    }

    const width = ctx.measureText(text).width
    if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
        textWidthCache.clear()
    }
    textWidthCache.set(key, width)
    return width
}

/**
 * 单个数值项
 */
export interface TitleValueItem {
    /** 标签（如 "DIF"、"DEA"） */
    label: string
    /** 数值 */
    value: number
    /** 颜色 */
    color: string
}

/**
 * 标题信息（由指标渲染器提供）
 */
export interface TitleInfo {
    /** 指标名称（如 "MACD"） */
    name: string
    /** 参数列表（如 [12, 26, 9]） */
    params?: number[]
    /** 数值项列表 */
    values?: TitleValueItem[]
}

export interface PaneTitleOptions {
    /** 面板 ID */
    paneId: string
    /** 标题文本（静态模式） */
    title: string
    /** 副标题/描述 */
    description?: string
    /** Y 偏移（逻辑像素） */
    yOffset?: number
    /** 动态标题信息提供函数 */
    getTitleInfo?: () => TitleInfo | null
}

/**
 * 创建面板标题渲染器插件
 * 在面板左上角显示标题，支持动态指标数值显示
 */
export function createPaneTitleRendererPlugin(options: PaneTitleOptions): RendererPlugin {
    let currentOptions = { ...options }

    return {
        name: `paneTitle_${options.paneId}`,
        version: '1.0.0',
        description: '面板标题渲染器',
        debugName: '面板标题',
        paneId: options.paneId,
        priority: RENDERER_PRIORITY.FOREGROUND,
        layer: 'overlay',

        draw(context: RenderContext) {
            const { overlayCtx, pane, paneWidth } = context
            const colors = getColors(context.theme)
            if (pane.id !== currentOptions.paneId || !overlayCtx) return

            const fontSize = 12
            const x = 12
            const y = currentOptions.yOffset ?? fontSize
            const gap = 8

            overlayCtx.save()
            setCanvasFont(overlayCtx, getFont(fontSize))
            overlayCtx.textAlign = 'left'
            overlayCtx.textBaseline = 'top'

            const titleInfo = currentOptions.getTitleInfo?.()

            if (titleInfo) {
                let currentX = x

                overlayCtx.fillStyle = colors.TEXT.PRIMARY
                overlayCtx.fillText(titleInfo.name, currentX, y)
                currentX += measureTextWidth(overlayCtx, titleInfo.name)

                if (titleInfo.params && titleInfo.params.length > 0) {
                    const paramText = `(${titleInfo.params.join(',')})`
                    overlayCtx.fillStyle = colors.TEXT.TERTIARY
                    overlayCtx.fillText(paramText, currentX, y)
                    currentX += measureTextWidth(overlayCtx, paramText) + gap
                } else {
                    currentX += gap
                }

                if (titleInfo.values && titleInfo.values.length > 0) {
                    for (const item of titleInfo.values) {
                        const valueText = `${item.label} ${item.value.toFixed(3)}`
                        overlayCtx.fillStyle = item.color
                        overlayCtx.fillText(valueText, currentX, y)
                        currentX += measureTextWidth(overlayCtx, valueText) + gap
                    }
                }
            } else {
                overlayCtx.fillStyle = colors.TEXT.PRIMARY
                overlayCtx.fillText(currentOptions.title, x, y)

                if (currentOptions.description) {
                    const titleWidth = measureTextWidth(overlayCtx, currentOptions.title)
                    overlayCtx.fillStyle = colors.TEXT.WEAK
                    overlayCtx.fillText(` - ${currentOptions.description}`, x + titleWidth, y)
                }
            }

            overlayCtx.restore()
        },

        setConfig(config: Record<string, unknown>) {
            currentOptions = { ...currentOptions, ...config }
        },
    }
}
