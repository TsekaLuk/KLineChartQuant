import { CandleWebGLSurface, LineWebGLSurface } from './renderers/webgl/candleSurface'
import type { SharedWebGLSurface, WebGLRegion } from './renderers/webgl/sharedWebGLSurface'

export type PaneRendererDom = {
    mainCanvas: HTMLCanvasElement      // 主画布：K线、指标、网格
    overlayCanvas: HTMLCanvasElement   // 覆盖层：十字线、Tooltip（透明）
    yAxisCanvas: HTMLCanvasElement     // Y轴刻度
}

export type PaneRendererContexts = {
    mainCtx: CanvasRenderingContext2D | null
    overlayCtx: CanvasRenderingContext2D | null
    yAxisCtx: CanvasRenderingContext2D | null
}

export type PaneRendererOptions = {
    rightAxisWidth: number
    yPaddingPx: number
    priceLabelWidth?: number
}

export type PaneRendererWebGLHandles = {
    candleSurface: CandleWebGLSurface | null
    lineSurface: LineWebGLSurface | null
}

/* PaneRenderer：负责单个 Pane 的 Canvas 管理与运行时状态持有
   创建并管理 mainCanvas / overlayCanvas / yAxisCanvas
   持有 Pane 实例（布局、Y 轴、价格范围）
   响应 Chart 的 resize / layout 信号
   渲染逻辑由 RendererPluginManager 统一调度 */
export class PaneRenderer {
    private dom: PaneRendererDom
    private pane: import('./layout/pane').Pane
    private opt: PaneRendererOptions
    private contexts: PaneRendererContexts | null = null
    private webgl: PaneRendererWebGLHandles

    constructor(
        dom: PaneRendererDom,
        pane: import('./layout/pane').Pane,
        opt: PaneRendererOptions,
        sharedWebGLSurface: SharedWebGLSurface,
    ) {
        this.dom = dom
        this.pane = pane
        this.opt = {
            ...opt,
            priceLabelWidth: opt.priceLabelWidth || 60,
        }
        this.webgl = {
            candleSurface: new CandleWebGLSurface(sharedWebGLSurface),
            lineSurface: new LineWebGLSurface(sharedWebGLSurface),
        }
    }

    /** 获取关联的 Pane 实例 */
    getPane(): import('./layout/pane').Pane {
        return this.pane
    }

    /** 获取 DOM 元素 */
    getDom(): PaneRendererDom {
        return this.dom
    }

    getContexts(): PaneRendererContexts {
        if (!this.contexts) {
            this.contexts = {
                mainCtx: this.dom.mainCanvas.getContext('2d'),
                overlayCtx: this.dom.overlayCanvas.getContext('2d'),
                yAxisCtx: this.dom.yAxisCanvas.getContext('2d'),
            }
        }
        return this.contexts
    }

    getWebGL(): PaneRendererWebGLHandles {
        return this.webgl
    }

    setWebGLRegion(region: WebGLRegion): void {
        this.webgl.candleSurface?.setRegion(region)
        this.webgl.lineSurface?.setRegion(region)
    }

    /**
     * 调整 Canvas 尺寸
     * @param width pane 宽度（逻辑像素）
     * @param height pane 高度（逻辑像素）
     * @param dpr 设备像素比
     */
    resize(width: number, height: number, dpr: number) {
        const mainCanvas = this.dom.mainCanvas
        const overlayCanvas = this.dom.overlayCanvas
        const yAxisCanvas = this.dom.yAxisCanvas

        // 先读取 parentClientWidth，避免在写入样式后读取触发强制回流
        const fallbackYAxisWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
        const parentClientWidth = yAxisCanvas.parentElement?.clientWidth ?? 0
        const canvasYAxisWidth = parentClientWidth > 0 ? parentClientWidth : fallbackYAxisWidth

        // Main Canvas
        const mainWidth = Math.round(width * dpr)
        if (mainCanvas.width !== mainWidth) {
            mainCanvas.width = mainWidth
        }

        const mainHeight = Math.round(height * dpr)
        if (mainCanvas.height !== mainHeight) {
            mainCanvas.height = mainHeight
        }

        const mainCssWidth = `${mainWidth / dpr}px`
        if (mainCanvas.style.width !== mainCssWidth) {
            mainCanvas.style.width = mainCssWidth
        }

        const mainCssHeight = `${mainHeight / dpr}px`
        if (mainCanvas.style.height !== mainCssHeight) {
            mainCanvas.style.height = mainCssHeight
        }

        // Overlay Canvas - 与 Main Canvas 相同尺寸
        if (overlayCanvas.width !== mainWidth) {
            overlayCanvas.width = mainWidth
        }
        if (overlayCanvas.height !== mainHeight) {
            overlayCanvas.height = mainHeight
        }
        if (overlayCanvas.style.width !== mainCssWidth) {
            overlayCanvas.style.width = mainCssWidth
        }
        if (overlayCanvas.style.height !== mainCssHeight) {
            overlayCanvas.style.height = mainCssHeight
        }

        // YAxis Canvas
        const yAxisWidth = Math.round(canvasYAxisWidth * dpr)
        if (yAxisCanvas.width !== yAxisWidth) {
            yAxisCanvas.width = yAxisWidth
        }

        const yAxisHeight = Math.round(height * dpr)
        if (yAxisCanvas.height !== yAxisHeight) {
            yAxisCanvas.height = yAxisHeight
        }

        const yAxisCssWidth = `${yAxisWidth / dpr}px`
        if (yAxisCanvas.style.width !== yAxisCssWidth) {
            yAxisCanvas.style.width = yAxisCssWidth
        }

        const yAxisCssHeight = `${yAxisHeight / dpr}px`
        if (yAxisCanvas.style.height !== yAxisCssHeight) {
            yAxisCanvas.style.height = yAxisCssHeight
        }

        this.webgl.candleSurface?.resize(width, height, dpr)
        this.webgl.lineSurface?.resize(width, height, dpr)
    }

    /** 销毁 PaneRenderer 实例 */
    destroy() {
        this.contexts = null
        this.webgl.candleSurface?.destroy()
        this.webgl.lineSurface?.destroy()
    }
}
