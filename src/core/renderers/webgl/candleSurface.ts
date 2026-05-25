type Rect = {
    x: number
    y: number
    width: number
    height: number
}

type LineStrip = {
    points: Array<{ x: number; y: number }>
    width: number
}

type ColoredLineStrip = LineStrip & {
    color: string
}

type FilledBand = {
    upperPoints: Array<{ x: number; y: number }>
    lowerPoints: Array<{ x: number; y: number }>
}

type FloatColor = readonly [number, number, number, number]

type RectWebGLHandles = {
    gl: WebGL2RenderingContext
    program: WebGLProgram
    vao: WebGLVertexArrayObject
    unitBuffer: WebGLBuffer
    rectBuffer: WebGLBuffer
    resolutionLocation: WebGLUniformLocation
    scrollXLocation: WebGLUniformLocation
    colorLocation: WebGLUniformLocation
}

type LineWebGLHandles = {
    gl: WebGL2RenderingContext
    program: WebGLProgram
    vao: WebGLVertexArrayObject
    vertexBuffer: WebGLBuffer
    resolutionLocation: WebGLUniformLocation
    scrollXLocation: WebGLUniformLocation
    colorLocation: WebGLUniformLocation
}

const RECT_VERTEX_SHADER_SOURCE = `#version 300 es
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

const LINE_VERTEX_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 a_position;

uniform vec2 u_resolution;
uniform float u_scrollX;

void main() {
    vec2 position = vec2(a_position.x - u_scrollX, a_position.y);
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
    private handles: RectWebGLHandles | null = null
    private logicalWidth = 0
    private logicalHeight = 0
    private available = false
    private rectCapacity = 0
    private rectScratch = new Float32Array(0)

    constructor(canvas?: HTMLCanvasElement) {
        this.canvas = canvas ?? document.createElement('canvas')
        this.handles = this.initRectHandles()
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

        const colorValue = parseColor(color)
        if (!colorValue) return false

        const floatCount = rects.length * 4
        if (this.rectScratch.length < floatCount) {
            this.rectScratch = new Float32Array(nextBufferFloatCapacity(floatCount))
        }

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i]!
            const offset = i * 4
            this.rectScratch[offset] = rect.x
            this.rectScratch[offset + 1] = rect.y
            this.rectScratch[offset + 2] = rect.width
            this.rectScratch[offset + 3] = rect.height
        }

        const { gl } = handles
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.useProgram(handles.program)
        gl.bindVertexArray(handles.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, handles.rectBuffer)

        if (this.rectCapacity < floatCount) {
            this.rectCapacity = nextBufferFloatCapacity(floatCount)
            gl.bufferData(gl.ARRAY_BUFFER, this.rectCapacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW)
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.rectScratch.subarray(0, floatCount))

        gl.uniform2f(handles.resolutionLocation, this.logicalWidth, this.logicalHeight)
        gl.uniform1f(handles.scrollXLocation, scrollLeft)
        gl.uniform4f(handles.colorLocation, colorValue[0], colorValue[1], colorValue[2], colorValue[3])
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, rects.length)
        gl.bindVertexArray(null)
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

    private initRectHandles(): RectWebGLHandles | null {
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

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, RECT_VERTEX_SHADER_SOURCE)
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

export class LineWebGLSurface {
    private canvas: HTMLCanvasElement
    private handles: LineWebGLHandles | null = null
    private logicalWidth = 0
    private logicalHeight = 0
    private dpr = 1
    private available = false
    private vertexCapacity = 0
    private fillScratch = new Float32Array(0)

    // Geometry cache: 以 points 数组引用 + halfWidth 为 key，避免每帧重算法线/miter
    private geoCache = new WeakMap<Array<{ x: number; y: number }>, Map<number, { vertices: Float32Array; vertexCount: number }>>()

    constructor(canvas?: HTMLCanvasElement) {
        this.canvas = canvas ?? document.createElement('canvas')
        this.handles = this.initLineHandles()
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
        this.dpr = dpr

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

    drawLineStrip(line: LineStrip, color: string, scrollLeft: number): boolean {
        return this.drawLineStrips([{ ...line, color }], scrollLeft)
    }

    drawLineStrips(lines: ColoredLineStrip[], scrollLeft: number): boolean {
        const handles = this.handles
        if (!handles || lines.length === 0 || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
            return false
        }

        const entries: Array<{
            colorValue: FloatColor
            pointCount: number
            vertices: Float32Array
            mode: number
        }> = []
        for (const line of lines) {
            if (line.points.length < 2) return false

            const colorValue = parseColor(line.color)
            if (!colorValue) return false

            if (line.width === 1) {
                const vertices = this.getThinLineVertices(line.points)
                entries.push({ colorValue, pointCount: line.points.length, vertices, mode: handles.gl.LINE_STRIP })
                continue
            }

            const geometry = this.getLineGeometry(line)
            if (!geometry) return false

            entries.push({
                colorValue,
                pointCount: geometry.vertexCount,
                vertices: geometry.vertices,
                mode: handles.gl.TRIANGLES,
            })
        }

        const { gl } = handles
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.useProgram(handles.program)
        gl.bindVertexArray(handles.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, handles.vertexBuffer)

        gl.uniform2f(handles.resolutionLocation, this.logicalWidth, this.logicalHeight)
        gl.uniform1f(handles.scrollXLocation, scrollLeft)

        for (const entry of entries) {
            const { colorValue, pointCount, vertices, mode } = entry
            const floatCount = vertices.length
            if (this.vertexCapacity < floatCount) {
                this.vertexCapacity = nextBufferFloatCapacity(floatCount)
                gl.bufferData(gl.ARRAY_BUFFER, this.vertexCapacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW)
            }
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices)
            gl.uniform4f(handles.colorLocation, colorValue[0], colorValue[1], colorValue[2], colorValue[3])
            gl.drawArrays(mode, 0, pointCount)
        }

        gl.bindVertexArray(null)
        return true
    }

    private getThinLineVertices(points: Array<{ x: number; y: number }>): Float32Array {
        const vertices = new Float32Array(points.length * 2)
        let writeIndex = 0
        for (const point of points) {
            vertices[writeIndex++] = point.x
            vertices[writeIndex++] = point.y
        }
        return vertices
    }

    private getLineGeometry(line: LineStrip): { vertices: Float32Array; vertexCount: number } | null {
        const halfWidth = line.width / 2
        let widthMap = this.geoCache.get(line.points)
        if (widthMap) {
            const cached = widthMap.get(halfWidth)
            if (cached) return cached
        } else {
            widthMap = new Map()
            this.geoCache.set(line.points, widthMap)
        }

        const geometry = buildJoinedPolylineGeometry(line.points, halfWidth)
        if (geometry) widthMap.set(halfWidth, geometry)
        return geometry
    }

    drawFilledBand(band: FilledBand, color: string, scrollLeft: number): boolean {
        const handles = this.handles
        const pointCount = Math.min(band.upperPoints.length, band.lowerPoints.length)
        if (!handles || pointCount < 2 || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
            return false
        }

        const colorValue = parseColor(color)
        if (!colorValue) return false

        const vertexCount = (pointCount - 1) * 6
        const floatCount = vertexCount * 2
        if (this.fillScratch.length < floatCount) {
            this.fillScratch = new Float32Array(nextBufferFloatCapacity(floatCount))
        }

        let writeIndex = 0
        for (let i = 0; i < pointCount - 1; i++) {
            const upperA = band.upperPoints[i]!
            const upperB = band.upperPoints[i + 1]!
            const lowerA = band.lowerPoints[i]!
            const lowerB = band.lowerPoints[i + 1]!

            this.fillScratch[writeIndex++] = upperA.x
            this.fillScratch[writeIndex++] = upperA.y
            this.fillScratch[writeIndex++] = lowerA.x
            this.fillScratch[writeIndex++] = lowerA.y
            this.fillScratch[writeIndex++] = upperB.x
            this.fillScratch[writeIndex++] = upperB.y
            this.fillScratch[writeIndex++] = upperB.x
            this.fillScratch[writeIndex++] = upperB.y
            this.fillScratch[writeIndex++] = lowerA.x
            this.fillScratch[writeIndex++] = lowerA.y
            this.fillScratch[writeIndex++] = lowerB.x
            this.fillScratch[writeIndex++] = lowerB.y
        }

        const { gl } = handles
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.useProgram(handles.program)
        gl.bindVertexArray(handles.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, handles.vertexBuffer)

        if (this.vertexCapacity < floatCount) {
            this.vertexCapacity = nextBufferFloatCapacity(floatCount)
            gl.bufferData(gl.ARRAY_BUFFER, this.vertexCapacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW)
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fillScratch.subarray(0, floatCount))

        gl.uniform2f(handles.resolutionLocation, this.logicalWidth, this.logicalHeight)
        gl.uniform1f(handles.scrollXLocation, scrollLeft)
        gl.uniform4f(handles.colorLocation, colorValue[0], colorValue[1], colorValue[2], colorValue[3])
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount)
        gl.bindVertexArray(null)
        return true
    }

    destroy(): void {
        const handles = this.handles
        if (!handles) return

        const { gl, program, vao, vertexBuffer } = handles
        gl.deleteBuffer(vertexBuffer)
        gl.deleteVertexArray(vao)
        gl.deleteProgram(program)
        this.handles = null
        this.available = false
    }

    private initLineHandles(): LineWebGLHandles | null {
        let gl: WebGL2RenderingContext | null = null
        try {
            gl = this.canvas.getContext('webgl2', {
                alpha: true,
                antialias: true,
                depth: false,
                stencil: false,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
            })
        } catch {
            gl = null
        }

        if (!gl) return null

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, LINE_VERTEX_SHADER_SOURCE)
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
        const vertexBuffer = gl.createBuffer()
        if (!vao || !vertexBuffer) {
            if (vao) gl.deleteVertexArray(vao)
            if (vertexBuffer) gl.deleteBuffer(vertexBuffer)
            gl.deleteProgram(program)
            return null
        }

        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
        const scrollXLocation = gl.getUniformLocation(program, 'u_scrollX')
        const colorLocation = gl.getUniformLocation(program, 'u_color')
        if (!resolutionLocation || !scrollXLocation || !colorLocation) {
            gl.deleteBuffer(vertexBuffer)
            gl.deleteVertexArray(vao)
            gl.deleteProgram(program)
            return null
        }

        const positionLocation = gl.getAttribLocation(program, 'a_position')
        if (positionLocation < 0) {
            gl.deleteBuffer(vertexBuffer)
            gl.deleteVertexArray(vao)
            gl.deleteProgram(program)
            return null
        }

        gl.bindVertexArray(vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
        gl.bindVertexArray(null)

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        return {
            gl,
            program,
            vao,
            vertexBuffer,
            resolutionLocation,
            scrollXLocation,
            colorLocation,
        }
    }
}


function nextBufferFloatCapacity(required: number): number {
    let capacity = 1
    while (capacity < required) {
        capacity <<= 1
    }
    return capacity
}

interface PolylineNormal {
    nx: number
    ny: number
    valid: boolean
}

function buildJoinedPolylineGeometry(points: Array<{ x: number; y: number }>, halfWidth: number) {
    if (points.length < 2) return null

    // 使用固定结构数组，避免动态对象分配
    const normals: PolylineNormal[] = new Array(points.length - 1)
    let validSegmentCount = 0

    // 第一遍：计算所有法线
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i]!
        const end = points[i + 1]!
        const dx = end.x - start.x
        const dy = end.y - start.y
        const length = Math.hypot(dx, dy)
        if (length <= 0) {
            normals[i] = { nx: 0, ny: 0, valid: false }
            continue
        }
        normals[i] = { nx: -dy / length, ny: dx / length, valid: true }
        validSegmentCount++
    }

    if (validSegmentCount === 0) return null

    // 预分配顶点数组：每对有效相邻点生成12个float（6个顶点 * 2个坐标）
    // 最多 (points.length - 1) 个线段
    const maxVerticesFloats = (points.length - 1) * 12
    const vertices = new Float32Array(maxVerticesFloats)
    let vertexWriteIndex = 0

    // 计算 miter 并直接写入顶点
    for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i]!
        const next = points[i + 1]!

        const prevNormal = i > 0 ? normals[i - 1] : null
        const currNormal = normals[i]!

        if (!currNormal.valid) continue
        if (!prevNormal && !currNormal.valid) continue

        // 计算 curr 点的 miter 法线
        let miterNX = 0
        let miterNY = 0
        if (prevNormal?.valid && currNormal.valid) {
            miterNX = prevNormal.nx + currNormal.nx
            miterNY = prevNormal.ny + currNormal.ny
            const miterLen = Math.hypot(miterNX, miterNY)
            if (miterLen > 1e-6) {
                miterNX /= miterLen
                miterNY /= miterLen
                const dot = miterNX * currNormal.nx + miterNY * currNormal.ny
                const safeDot = Math.max(0.2, Math.abs(dot))
                miterNX *= 1 / safeDot
                miterNY *= 1 / safeDot
            } else {
                miterNX = currNormal.nx
                miterNY = currNormal.ny
            }
        } else if (currNormal.valid) {
            miterNX = currNormal.nx
            miterNY = currNormal.ny
        } else if (prevNormal?.valid) {
            miterNX = prevNormal.nx
            miterNY = prevNormal.ny
        } else {
            continue
        }

        // 计算 next 点的法线（用于下一对点）
        let nextMiterNX = currNormal.nx
        let nextMiterNY = currNormal.ny
        const nextNormal = i < points.length - 2 ? normals[i + 1] : null
        if (nextNormal?.valid && currNormal.valid) {
            nextMiterNX = currNormal.nx + nextNormal.nx
            nextMiterNY = currNormal.ny + nextNormal.ny
            const miterLen = Math.hypot(nextMiterNX, nextMiterNY)
            if (miterLen > 1e-6) {
                nextMiterNX /= miterLen
                nextMiterNY /= miterLen
                const dot = nextMiterNX * nextNormal.nx + nextMiterNY * nextNormal.ny
                const safeDot = Math.max(0.2, Math.abs(dot))
                nextMiterNX *= 1 / safeDot
                nextMiterNY *= 1 / safeDot
            } else {
                nextMiterNX = currNormal.nx
                nextMiterNY = currNormal.ny
            }
        }

        // 计算四个角点
        const leftAX = curr.x + miterNX * halfWidth
        const leftAY = curr.y + miterNY * halfWidth
        const rightAX = curr.x - miterNX * halfWidth
        const rightAY = curr.y - miterNY * halfWidth
        const leftBX = next.x + nextMiterNX * halfWidth
        const leftBY = next.y + nextMiterNY * halfWidth
        const rightBX = next.x - nextMiterNX * halfWidth
        const rightBY = next.y - nextMiterNY * halfWidth

        // 写入两个三角形（6个顶点）
        vertices[vertexWriteIndex++] = leftAX
        vertices[vertexWriteIndex++] = leftAY
        vertices[vertexWriteIndex++] = rightAX
        vertices[vertexWriteIndex++] = rightAY
        vertices[vertexWriteIndex++] = leftBX
        vertices[vertexWriteIndex++] = leftBY
        vertices[vertexWriteIndex++] = leftBX
        vertices[vertexWriteIndex++] = leftBY
        vertices[vertexWriteIndex++] = rightAX
        vertices[vertexWriteIndex++] = rightAY
        vertices[vertexWriteIndex++] = rightBX
        vertices[vertexWriteIndex++] = rightBY
    }

    if (vertexWriteIndex === 0) return null

    return {
        vertices: vertexWriteIndex === maxVerticesFloats ? vertices : vertices.subarray(0, vertexWriteIndex),
        vertexCount: vertexWriteIndex / 2,
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
