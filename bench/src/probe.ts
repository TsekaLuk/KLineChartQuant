/** 两个基准页面共用的浏览器探针：GPU 身份、刷新间隔、rAF 等待与 JS heap 读数。 */

/** 读取 WebGL 实例 renderer 字符串，用于拒绝软件光栅。 */
export function inspectWebGlRenderer(canvas: HTMLCanvasElement): string | null {
  const gl = canvas.getContext('webgl2')
  if (!gl) return null
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  if (!extension) return gl.getParameter(gl.RENDERER) as string
  return gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string
}

/** 等待下一帧 rAF 回调时间。 */
export function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

/** 读取页面当前 JS heap；Chrome 之外返回 null。 */
export function jsHeapUsed(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return memory?.usedJSHeapSize ?? null
}

/** 显式检查当前机器上的 WebGL/WebGPU 设备信息。 */
export async function inspectGpu(): Promise<Record<string, unknown>> {
  const canvas = document.createElement('canvas')
  const webglRenderer = inspectWebGlRenderer(canvas)
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    webglRenderer,
    webgpuAvailable: Boolean(adapter),
    webgpuAdapter: adapter
      ? {
          vendor: adapter.info.vendor,
          architecture: adapter.info.architecture,
          device: adapter.info.device,
          description: adapter.info.description,
          isFallbackAdapter: adapter.info.isFallbackAdapter ?? false,
        }
      : null,
  }
}

/** 在空闲页面上测量显示刷新间隔，用于判断掉帧阈值或确认帧率上限已解除。 */
export async function measureRefreshIntervals(frames: number): Promise<number[]> {
  const intervals: number[] = []
  let previous = await nextAnimationFrame()
  for (let index = 0; index < frames; index += 1) {
    const current = await nextAnimationFrame()
    intervals.push(current - previous)
    previous = current
  }
  return intervals
}
