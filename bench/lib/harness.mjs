/**
 * 基准运行器共用的 Node 侧工具：Vite 与 Chrome 生命周期、最小 CDP 客户端、页面求值与统计函数。
 * run.mjs（渲染后端对比）与 compare.mjs（图表库对比）共用这一份实现。
 */

import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

/** 等待条件成立，超时后抛出带上下文的错误。 */
export async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`)
}

/** 建立最小 CDP 客户端，支持浏览器级和页面级命令，以及按方法名订阅事件。 */
export function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  let sequence = 0
  const pending = new Map()
  const listeners = new Map()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params)
      return
    }
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  return {
    async ready() {
      if (socket.readyState === WebSocket.OPEN) return
      await new Promise((resolveOpen, rejectOpen) => {
        socket.addEventListener('open', resolveOpen, { once: true })
        socket.addEventListener('error', rejectOpen, { once: true })
      })
    },
    send(method, params = {}) {
      sequence += 1
      const id = sequence
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener])
    },
    close() {
      socket.close()
    },
  }
}

/** 等待子进程退出；超时后由调用方决定是否强制终止。 */
export async function waitForExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return true
  return Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), timeoutMs)),
  ])
}

/** 执行页面表达式，并把异常转换为 Node 错误。 */
export async function evaluate(page, expression, awaitPromise = true) {
  const response = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? 'Page evaluation failed')
  }
  return response.result.value
}

/** 读取 CDP Performance 指标并按名称组织。 */
export async function performanceMetrics(page) {
  const response = await page.send('Performance.getMetrics')
  return Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]))
}

/** 计算分位数，输入会复制排序。 */
export function percentile(values, quantile) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * quantile
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/** 计算样本标准差，用于衡量连续帧间隔的离散程度。 */
export function standardDeviation(values) {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** 输出阶段日志；长等待期间用户必须知道当前卡在哪一步。 */
export function logPhase(message) {
  process.stderr.write(`[bench] ${message}\n`)
}

/** 等待期间每秒打一个点，避免单场景跑十几秒时界面完全静默。 */
export function heartbeat() {
  const timer = setInterval(() => process.stderr.write('.'), 1000)
  return () => clearInterval(timer)
}

/** 系统 Chrome 路径：KLINE_BENCH_CHROME 优先，否则取当前平台的默认安装位置。 */
export function chromeExecutable() {
  if (process.env.KLINE_BENCH_CHROME) return process.env.KLINE_BENCH_CHROME
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
  return 'google-chrome'
}

/**
 * 硬件 GPU 基准共用的 Chrome 参数：启用 GPU、禁止软件光栅与后台节流。
 *
 * @param options - 调试端口、临时 profile 目录与窗口尺寸
 * @returns 不含起始 URL 的参数列表，调用方可以追加场景专用参数
 */
export function benchChromeArgs({ remoteDebugPort, profileDir, width, height, dpr }) {
  return [
    '--headless=new',
    '--enable-gpu',
    '--force_high_performance_gpu',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-software-rasterizer',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--enable-precise-memory-info',
    `--remote-debugging-port=${remoteDebugPort}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${dpr}`,
    '--no-first-run',
    '--no-default-browser-check',
  ]
}

/** 以当前 Node 运行仓库内的 Vite CLI；参数决定是 dev、build 还是 preview。 */
export function spawnVite(repoDir, args) {
  return spawn(process.execPath, [resolve(repoDir, 'node_modules', 'vite', 'bin', 'vite.js'), ...args], {
    cwd: repoDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

/** 等待本地 HTTP 服务开始响应。 */
export function waitForHttp(url, label) {
  return waitFor(
    async () => {
      const response = await fetch(url)
      return response.ok
    },
    20_000,
    label,
  )
}

/** 以空白页启动 Chrome；页面由 openBenchPage 通过 CDP 打开。 */
export function launchChrome(chromePath, chromeArgs) {
  return spawn(chromePath, [...chromeArgs, 'about:blank'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

/**
 * 连接已启动的 Chrome，在新标签页打开基准页面并等待页面声明就绪。
 *
 * @returns 浏览器级与页面级 CDP 客户端
 */
export async function openBenchPage({ remoteDebugPort, url, readyExpression }) {
  const version = await waitFor(
    async () => {
      const response = await fetch(`http://127.0.0.1:${remoteDebugPort}/json/version`)
      return response.ok ? response.json() : null
    },
    20_000,
    'Chrome DevTools',
  )
  const browser = createCdpClient(version.webSocketDebuggerUrl)
  await browser.ready()
  const target = await fetch(
    `http://127.0.0.1:${remoteDebugPort}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
  ).then((response) => response.json())
  const page = createCdpClient(target.webSocketDebuggerUrl)
  await page.ready()
  await page.send('Runtime.enable')
  await page.send('Performance.enable')
  await waitFor(() => evaluate(page, readyExpression), 20_000, 'benchmark page')
  return { browser, page }
}

/**
 * 读取 GPU 身份并拒绝软件光栅；WebGL2 或 WebGPU 不可用时直接失败。
 *
 * @param inspectExpression - 页面内返回 GPU 信息的表达式
 * @returns CDP 系统信息、浏览器版本与页面侧 GPU 信息，写进报告
 */
export async function assertHardwareGpu(browser, page, inspectExpression) {
  const systemInfo = await browser.send('SystemInfo.getInfo')
  const browserVersion = await browser.send('Browser.getVersion')
  const pageGpu = await evaluate(page, inspectExpression)
  const identityText = JSON.stringify({ systemInfo, pageGpu }).toLowerCase()
  if (/swiftshader|llvmpipe|software only/.test(identityText)) {
    throw new Error('Software GPU backend detected; benchmark rejected')
  }
  if (!pageGpu.webgpuAvailable || !pageGpu.webglRenderer) {
    throw new Error('Hardware WebGL/WebGPU unavailable in headless Chrome')
  }
  return { systemInfo, browserVersion, pageGpu }
}

/** 关闭页面、浏览器与本地服务，并删除临时 profile；尚未创建的句柄直接跳过。 */
export async function closeBenchSession({ page, browser, chrome, server, profileDir }) {
  page?.close()
  try {
    await browser?.send('Browser.close')
  } catch {
    chrome?.kill()
  }
  browser?.close()
  if (!(await waitForExit(chrome))) chrome?.kill()
  server?.kill()
  await waitForExit(server)
  await rm(profileDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  })
}
