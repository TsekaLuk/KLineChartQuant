type Rect = {
    x: number
    y: number
    width: number
    height: number
}

type FloatColor = readonly [number, number, number, number]

type WebGLHandles = {
    gl: WebGL2RenderingContext
    program: WebGLProgram
    vao: WebGLVertexArrayObject
    unitBuffer: WebGLBuffer
    rectBuffer: WebGLBuffer
    resolutionLocation: WebGLUniformLocation
    scrollXLocation: WebGLUniformLocation
    colorLocation: WebGLUniformLocation
}

const VERTEX_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 a_unit;
in vec4 a_rect;

uniform vec2 u_resolution;
uniform float u_scrollX;

void main() {
    vec2 position = vec2(
        a_rect.x - u_scrollX + a_unit.x * a_rect.z,
        a_rect.y + a_unit.y * a_rect.w
    );

    vec2 zeroToOne = position / u_resolution;
    vec2 clip = vec2(
        zeroToOne.x * 2.0 - 1.0,
        1.0 - zeroToOne.y * 2.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
}`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

uniform vec4 u_color;
out vec4 outColor;

void main() {
    outColor = u_color;
}`

const UNIT_QUAD = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    0, 1,
    1, 0,
    1, 1,
])

export class CandleWebGLSurface {
    private canvas: HTMLCanvasElement
    private handles: WebGLHandles | null = null
    private logicalWidth = 0
    private logicalHeight = 0
    private available = false

    constructor(canvas?: HTMLCanvasElement) {
        this.canvas = canvas ?? document.createElement('canvas')
        this.handles = this.initHandles()
        this.available = this.handles !== null
    }

    isAvailable(): boolean {
        return this.available
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas
    }

    resize(width: number, height: number, dpr: number): void {
        this.logicalWidth = width
        this.logicalHeight = height

        const nextWidth = Math.max(1, Math.round(width * dpr))
        const nextHeight = Math.max(1, Math.round(height * dpr))

        if (this.canvas.width !== nextWidth) {
            this.canvas.width = nextWidth
        }
        if (this.canvas.height !== nextHeight) {
            this.canvas.height = nextHeight
        }
    }

    clear(): void {
        const gl = this.handles?.gl
        if (!gl || this.logicalWidth <= 0 || this.logicalHeight <= 0) return

        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
    }

    drawRects(rects: Rect[], color: string, scrollLeft: number): boolean {
        const handles = this.handles
        if (!handles || !rects.length || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
            return false
        }

        const gl = handles.gl
        const colorValue = parseColor(color)
        if (!colorValue) return false

        const rectData = new Float32Array(rects.length * 4)
        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i]
            const offset = i * 4
            rectData[offset] = rect.x
            rectData[offset + 1] = rect.y
            rectData[offset + 2] = rect.width
            rectData[offset + 3] = rect.height
        }

        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.useProgram(handles.program)
        gl.bindVertexArray(handles.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, handles.rectBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, rectData, gl.DYNAMIC_DRAW)

        gl.uniform2f(handles.resolutionLocation, this.logicalWidth, this.logicalHeight)
        gl.uniform1f(handles.scrollXLocation, scrollLeft)
        gl.uniform4f(handles.colorLocation, colorValue[0], colorValue[1], colorValue[2], colorValue[3])
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, rects.length)
        gl.bindVertexArray(null)
        gl.flush()
        return true
    }

    destroy(): void {
        const handles = this.handles
        if (!handles) return

        const { gl, program, vao, unitBuffer, rectBuffer } = handles
        gl.deleteBuffer(unitBuffer)
        gl.deleteBuffer(rectBuffer)
        gl.deleteVertexArray(vao)
        gl.deleteProgram(program)
        this.handles = null
        this.available = false
    }

    private initHandles(): WebGLHandles | null {
        let gl: WebGL2RenderingContext | null = null
        try {
            gl = this.canvas.getContext('webgl2', {
                alpha: true,
                antialias: false,
                depth: false,
                stencil: false,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
            })
        } catch {
            gl = null
        }

        if (!gl) return null

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
        if (!vertexShader || !fragmentShader) {
            if (vertexShader) gl.deleteShader(vertexShader)
            if (fragmentShader) gl.deleteShader(fragmentShader)
            return null
        }

        const program = createProgram(gl, vertexShader, fragmentShader)
        gl.deleteShader(vertexShader)
        gl.deleteShader(fragmentShader)
        if (!program) return null

        const vao = gl.createVertexArray()
        const unitBuffer = gl.createBuffer()
        const rectBuffer = gl.createBuffer()
        if (!vao || !unitBuffer || !rectBuffer) {
            if (vao) gl.deleteVertexArray(vao)
            if (unitBuffer) gl.deleteBuffer(unitBuffer)
            if (rectBuffer) gl.deleteBuffer(rectBuffer)
            gl.deleteProgram(program)
            return null
        }

        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
        const scrollXLocation = gl.getUniformLocation(program, 'u_scrollX')
        const colorLocation = gl.getUniformLocation(program, 'u_color')
        if (!resolutionLocation || !scrollXLocation || !colorLocation) {
            gl.deleteBuffer(unitBuffer)
            gl.deleteBuffer(rectBuffer)
            gl.deleteVertexArray(vao)
            gl.deleteProgram(program)
            return null
        }

        const unitLocation = gl.getAttribLocation(program, 'a_unit')
        const rectLocation = gl.getAttribLocation(program, 'a_rect')
        if (unitLocation < 0 || rectLocation < 0) {
            gl.deleteBuffer(unitBuffer)
            gl.deleteBuffer(rectBuffer)
            gl.deleteVertexArray(vao)
            gl.deleteProgram(program)
            return null
        }

        gl.bindVertexArray(vao)

        gl.bindBuffer(gl.ARRAY_BUFFER, unitBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW)
        gl.enableVertexAttribArray(unitLocation)
        gl.vertexAttribPointer(unitLocation, 2, gl.FLOAT, false, 0, 0)
        gl.vertexAttribDivisor(unitLocation, 0)

        gl.bindBuffer(gl.ARRAY_BUFFER, rectBuffer)
        gl.enableVertexAttribArray(rectLocation)
        gl.vertexAttribPointer(rectLocation, 4, gl.FLOAT, false, 16, 0)
        gl.vertexAttribDivisor(rectLocation, 1)

        gl.bindVertexArray(null)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        return {
            gl,
            program,
            vao,
            unitBuffer,
            rectBuffer,
            resolutionLocation,
            scrollXLocation,
            colorLocation,
        }
    }
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type)
    if (!shader) return null

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        return shader
    }

    gl.deleteShader(shader)
    return null
}

function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
    const program = gl.createProgram()
    if (!program) return null

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return program
    }

    gl.deleteProgram(program)
    return null
}

function parseColor(color: string): FloatColor | null {
    const normalized = color.trim().toLowerCase()

    if (normalized.startsWith('rgba(')) {
        const values = normalized.slice(5, -1).split(',').map((part) => Number(part.trim()))
        if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
            return [values[0]! / 255, values[1]! / 255, values[2]! / 255, values[3]!]
        }
    }

    if (normalized.startsWith('rgb(')) {
        const values = normalized.slice(4, -1).split(',').map((part) => Number(part.trim()))
        if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
            return [values[0]! / 255, values[1]! / 255, values[2]! / 255, 1]
        }
    }

    if (normalized.startsWith('#')) {
        const hex = normalized.slice(1)
        if (hex.length === 6) {
            return [
                Number.parseInt(hex.slice(0, 2), 16) / 255,
                Number.parseInt(hex.slice(2, 4), 16) / 255,
                Number.parseInt(hex.slice(4, 6), 16) / 255,
                1,
            ]
        }
        if (hex.length === 3) {
            return [
                Number.parseInt(hex[0]! + hex[0]!, 16) / 255,
                Number.parseInt(hex[1]! + hex[1]!, 16) / 255,
                Number.parseInt(hex[2]! + hex[2]!, 16) / 255,
                1,
            ]
        }
    }

    return null
}
