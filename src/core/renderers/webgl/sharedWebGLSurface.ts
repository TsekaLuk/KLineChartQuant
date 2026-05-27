export type WebGLRegion = {
    x: number
    y: number
    width: number
    height: number
    dpr: number
}

export type WebGLCompositeOptions = {
    alpha?: number
    imageSmoothingEnabled?: boolean
}

export type PhysicalRegion = {
    sourceX: number
    sourceY: number
    widthPx: number
    heightPx: number
}

export class SharedWebGLSurface {
    private canvas: HTMLCanvasElement
    private gl: WebGL2RenderingContext | null = null

    constructor(canvas?: HTMLCanvasElement) {
        this.canvas = canvas ?? document.createElement('canvas')
        this.gl = this.initContext()
    }

    isAvailable(): boolean {
        return this.gl !== null
    }

    getGL(): WebGL2RenderingContext | null {
        return this.gl
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas
    }

    resize(width: number, height: number, dpr: number): void {
        const nextWidth = Math.max(1, Math.round(width * dpr))
        const nextHeight = Math.max(1, Math.round(height * dpr))

        if (this.canvas.width !== nextWidth) {
            this.canvas.width = nextWidth
        }
        if (this.canvas.height !== nextHeight) {
            this.canvas.height = nextHeight
        }
    }

    getPhysicalRegion(region: WebGLRegion): PhysicalRegion | null {
        return this.toPhysicalRegion(region)
    }

    bindRegion(region: WebGLRegion): boolean {
        const gl = this.gl
        const physical = this.toPhysicalRegion(region)
        if (!gl || !physical) return false

        const viewportY = this.canvas.height - physical.sourceY - physical.heightPx
        gl.enable(gl.SCISSOR_TEST)
        gl.viewport(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
        gl.scissor(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
        return true
    }

    clearRegion(region: WebGLRegion): void {
        const gl = this.gl
        if (!gl || !this.bindRegion(region)) return

        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
    }

    compositeRegionTo(ctx: CanvasRenderingContext2D, region: WebGLRegion, options: WebGLCompositeOptions = {}): void {
        const physical = this.toPhysicalRegion(region)
        if (!physical || physical.widthPx <= 0 || physical.heightPx <= 0) return

        const prevImageSmoothingEnabled = ctx.imageSmoothingEnabled
        const prevGlobalAlpha = ctx.globalAlpha
        const prevTransform = ctx.getTransform()

        if (options.imageSmoothingEnabled !== undefined) {
            ctx.imageSmoothingEnabled = options.imageSmoothingEnabled
        }
        if (options.alpha !== undefined) {
            ctx.globalAlpha = prevGlobalAlpha * options.alpha
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(
            this.canvas,
            physical.sourceX,
            physical.sourceY,
            physical.widthPx,
            physical.heightPx,
            0,
            0,
            physical.widthPx,
            physical.heightPx,
        )
        ctx.setTransform(prevTransform)

        ctx.globalAlpha = prevGlobalAlpha
        ctx.imageSmoothingEnabled = prevImageSmoothingEnabled
    }

    destroy(): void {
        this.canvas.width = 1
        this.canvas.height = 1
        this.gl = null
    }

    private toPhysicalRegion(region: WebGLRegion): PhysicalRegion | null {
        const widthPx = Math.max(0, Math.round(region.width * region.dpr))
        const heightPx = Math.max(0, Math.round(region.height * region.dpr))
        if (widthPx <= 0 || heightPx <= 0) return null

        const sourceX = Math.max(0, Math.round(region.x * region.dpr))
        const sourceY = Math.max(0, Math.round(region.y * region.dpr))
        return {
            sourceX,
            sourceY,
            widthPx,
            heightPx,
        }
    }

    private initContext(): WebGL2RenderingContext | null {
        try {
            return this.canvas.getContext('webgl2', {
                alpha: true,
                antialias: false,
                depth: false,
                stencil: false,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
            })
        } catch {
            return null
        }
    }
}
