/**
 * 图表库对比基准运行器。
 * 同一台机器、同一个无头 Chrome、同一份生产构建里，各库通过公开 API 绘制同一份 K 线与 MA，
 * 并逐帧向历史滚动一根。
 *
 * 无头 Chrome 的 rAF 跟随显示刷新封顶（macOS 上解除帧率上限的开关不生效），所以帧间隔只用来统计掉帧；
 * 成本来自两路互相印证的读数：页面内逐帧测得的「滚动调用 + 本帧 rAF 工作」分布，以及 CDP TaskDuration
 * 折算的平均主线程时间（含样式、布局与 GC）。每个场景先截图存档，供人工核对各库画的是同一张图。
 */

import { execFile, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { cpus, tmpdir, totalmem } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  assertHardwareGpu,
  benchChromeArgs,
  chromeExecutable,
  closeBenchSession,
  evaluate,
  heartbeat,
  launchChrome,
  logPhase,
  openBenchPage,
  percentile,
  performanceMetrics,
  spawnVite,
  standardDeviation,
  waitForHttp,
} from './lib/harness.mjs'

const execFileAsync = promisify(execFile)
const benchDir = dirname(fileURLToPath(import.meta.url))
const repoDir = resolve(benchDir, '..')
const viteConfig = resolve(benchDir, 'vite.config.ts')
const resultsDir = resolve(benchDir, 'results')
const screenshotDir = resolve(resultsDir, 'compare')
/** KCQ 以工作区源码参测，版本从 core 的 package.json 读取。 */
const KCQ_PACKAGE = '@363045841yyt/klinechart-core'

/** 读取 --name=value 形式的命令行参数。 */
function argument(name) {
  const prefix = `--${name}=`
  const match = process.argv.find((value) => value.startsWith(prefix))
  return match ? match.slice(prefix.length) : undefined
}

const csv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const port = 4173
const remoteDebugPort = Number(process.env.KLINE_BENCH_DEBUG_PORT ?? 9223)
const requestedVisibleBars = csv(argument('bars') ?? '150,500,1000').map(Number)
const requestedSubjects = argument('subjects')
const warmupFrames = Number(process.env.KLINE_BENCH_WARMUP ?? 60)
const sampleFrames = Number(process.env.KLINE_BENCH_FRAMES ?? 600)
const rounds = Math.max(1, Math.round(Number(argument('rounds') ?? 3)) || 1)
const width = 1180
const height = 640
const dpr = Number(process.env.KLINE_BENCH_DPR ?? 2)
/** 采样期间实际滚动根数允许的偏差：首尾各差一帧的提交延迟。 */
const SCROLL_TOLERANCE_BARS = 3
/** 超过刷新间隔 1.5 倍的帧计为掉帧，与 run.mjs 的口径一致。 */
const DROPPED_FRAME_MULTIPLIER = 1.5
/** 空帧开销与刷新率校准的采样帧数。 */
const CALIBRATION_FRAMES = 240
/** 转发到终端的页面控制台级别：库的警告往往就是结果无效的原因。 */
const FORWARDED_CONSOLE_TYPES = new Set(['warning', 'error'])
/** KCQ 的 K 线宽度按物理像素取整，可见根数是离散的；由它定档，其他库对齐到同一根数。三个后端共用同一套缩放网格。 */
const TIER_PROBE_SUBJECT = 'kcq-canvas'

/** 读取参测包的版本；KCQ 取工作区源码版本。 */
async function packageVersion(packageName) {
  const manifest =
    packageName === KCQ_PACKAGE
      ? resolve(repoDir, 'packages', 'core', 'package.json')
      : resolve(repoDir, 'node_modules', packageName, 'package.json')
  return JSON.parse(await readFile(manifest, 'utf8')).version
}

/** 生产构建对比页面；失败时直接退出，绝不退回开发服务器测量。 */
function buildComparePage() {
  logPhase('building production bundle…')
  const viteCli = resolve(repoDir, 'node_modules', 'vite', 'bin', 'vite.js')
  const result = spawnSync(process.execPath, [viteCli, 'build', '--config', viteConfig], {
    cwd: repoDir,
    stdio: ['ignore', 2, 2],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`vite build exited with ${result.status}`)
}

/** 截取当前视口并写入 PNG，用于核对各库渲染的是同一场景。 */
async function captureScreenshot(page, path) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(data, 'base64'))
}

/** 运行页面表达式；长场景期间持续打点。 */
async function evaluateWithHeartbeat(page, expression) {
  const stop = heartbeat()
  try {
    return await evaluate(page, expression)
  } finally {
    stop()
  }
}

/** 滚动核验：采样期间视口必须真的移动了约 sampleFrames 根，否则说明滚动 API 被吞掉，结果无效。 */
function assertScrolled(subjectId, sampled) {
  const drift = Math.abs(sampled.scrolledBars - sampleFrames)
  if (drift > SCROLL_TOLERANCE_BARS) {
    throw new Error(
      `${subjectId} scrolled ${sampled.scrolledBars} bars over ${sampleFrames} frames; result rejected`,
    )
  }
}

/** 合并多轮样本：逐帧数据全部汇总后取百分位，主线程时间按总帧数平均。 */
function summarize(info, visibleBars, measured, refreshIntervalMs) {
  const work = measured.flatMap((round) => round.sampled.frameWorkMs)
  const intervals = measured.flatMap((round) => round.sampled.frameIntervalsMs)
  const taskMs = measured.reduce((sum, round) => sum + round.taskSeconds * 1000, 0)
  // 逐轮主线程耗时：轮间差异就是这台机器上的噪声幅度，图上画成区间，而不是只给一个均值。
  const roundMainThreadMs = measured.map(
    (round) => (round.taskSeconds * 1000) / round.sampled.frameWorkMs.length,
  )
  const dropped = intervals.filter((value) => value > refreshIntervalMs * DROPPED_FRAME_MULTIPLIER)
  return {
    subject: info.id,
    library: info.library,
    renderer: info.renderer,
    visibleBars,
    actualVisibleBars: percentile(
      measured.map((round) => round.prepared.actualVisibleBars),
      0.5,
    ),
    mountMsP50: percentile(
      measured.map((round) => round.prepared.mountMs),
      0.5,
    ),
    frameWorkP50Ms: percentile(work, 0.5),
    frameWorkP95Ms: percentile(work, 0.95),
    frameWorkP99Ms: percentile(work, 0.99),
    frameWorkStdDevMs: standardDeviation(work),
    mainThreadMsPerFrame: taskMs / work.length,
    mainThreadMsPerFrameRounds: roundMainThreadMs,
    droppedFrameRate: dropped.length / intervals.length,
    frameIntervalP99Ms: percentile(intervals, 0.99),
    jsHeapUsedBytes: measured.at(-1).sampled.jsHeapUsedBytes,
    frameWorkMs: work,
    frameIntervalsMs: intervals,
  }
}

/** 汇总列写成 CSV，原始帧间隔只留在 JSON。 */
function toCsv(scenarios) {
  const columns = [
    'subject',
    'library',
    'renderer',
    'visibleBars',
    'actualVisibleBars',
    'mountMsP50',
    'frameWorkP50Ms',
    'frameWorkP95Ms',
    'frameWorkP99Ms',
    'frameWorkStdDevMs',
    'mainThreadMsPerFrame',
    'mainThreadMsPerFrameMin',
    'mainThreadMsPerFrameMax',
    'droppedFrameRate',
    'frameIntervalP99Ms',
    'jsHeapUsedBytes',
  ]
  const rows = scenarios.map((row) => {
    const derived = {
      mainThreadMsPerFrameMin: Math.min(...row.mainThreadMsPerFrameRounds),
      mainThreadMsPerFrameMax: Math.max(...row.mainThreadMsPerFrameRounds),
    }
    return columns.map((column) => derived[column] ?? row[column] ?? '').join(',')
  })
  return `${columns.join(',')}\n${rows.join('\n')}\n`
}

/**
 * 把请求的可见根数换成 KCQ 实际能取到的最接近根数，作为所有库共用的档位。
 *
 * @param page - 已就绪的对比页面会话
 * @returns 去重后的实际档位，顺序与请求一致
 */
async function resolveVisibleBarTiers(page) {
  const tiers = []
  for (const visibleBars of requestedVisibleBars) {
    const options = { subject: TIER_PROBE_SUBJECT, visibleBars, width, height, warmupFrames: 0, sampleFrames: 0 }
    const prepared = await evaluate(page, `window.compareBench.prepare(${JSON.stringify(options)})`)
    await evaluate(page, 'window.compareBench.teardown()')
    const tier = Math.round(prepared.actualVisibleBars)
    if (!tiers.includes(tier)) tiers.push(tier)
  }
  return tiers
}

/** 构建、启动预览服务与 Chrome，跑完整矩阵，并保证所有临时进程与目录被清理。 */
async function main() {
  buildComparePage()
  const profileDir = await mkdtemp(resolve(tmpdir(), 'kline-compare-bench-'))
  logPhase('starting Vite preview server…')
  const server = spawnVite(repoDir, ['preview', '--config', viteConfig])
  let chrome
  let browser
  let page
  try {
    const url = `http://127.0.0.1:${port}/compare.html`
    await waitForHttp(url, 'Vite preview')
    logPhase('launching headless Chrome…')
    const chromeArgs = benchChromeArgs({ remoteDebugPort, profileDir, width, height, dpr })
    chrome = launchChrome(chromeExecutable(), chromeArgs)
    ;({ browser, page } = await openBenchPage({
      remoteDebugPort,
      url,
      readyExpression: "document.body.dataset.ready === 'true'",
    }))
    await page.send('Page.enable')
    page.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (!FORWARDED_CONSOLE_TYPES.has(type)) return
      const text = args.map((arg) => arg.value ?? arg.description ?? '').join(' ')
      process.stderr.write(`\n[page ${type}] ${text}\n`)
    })
    const identity = await assertHardwareGpu(browser, page, 'window.compareBench.inspectGpu()')

    const refreshIntervalMs = percentile(
      await evaluate(page, `window.compareBench.measureRefreshIntervals(${CALIBRATION_FRAMES})`),
      0.5,
    )
    const overhead = await evaluate(
      page,
      `window.compareBench.measureFrameOverhead(${CALIBRATION_FRAMES})`,
    )
    const frameOverheadP50Ms = percentile(overhead, 0.5)
    const visibleBarSets = await resolveVisibleBarTiers(page)

    const available = await evaluate(page, 'window.compareBench.subjects()')
    const wanted = requestedSubjects ? csv(requestedSubjects) : available.map((info) => info.id)
    const subjects = wanted.map((id) => {
      const info = available.find((candidate) => candidate.id === id)
      if (!info) throw new Error(`Unknown subject ${id}`)
      return info
    })
    const total = subjects.length * visibleBarSets.length
    process.stderr.write(
      `Plan: ${total} scenarios × ${rounds} rounds, ${sampleFrames} frames each, tiers ${visibleBarSets.join('/')} bars, ` +
        `refresh ${refreshIntervalMs.toFixed(2)} ms, empty-frame overhead ${frameOverheadP50Ms.toFixed(3)} ms\n`,
    )

    await mkdir(screenshotDir, { recursive: true })
    const scenarios = []
    let index = 0
    for (const info of subjects) {
      for (const visibleBars of visibleBarSets) {
        index += 1
        const options = { subject: info.id, visibleBars, width, height, warmupFrames, sampleFrames }
        const measured = []
        for (let round = 1; round <= rounds; round += 1) {
          process.stderr.write(`[${index}/${total}] r${round}/${rounds} ${info.id} ${visibleBars}b `)
          const prepared = await evaluateWithHeartbeat(
            page,
            `window.compareBench.prepare(${JSON.stringify(options)})`,
          )
          if (round === 1) {
            await captureScreenshot(page, resolve(screenshotDir, `${info.id}-${visibleBars}.png`))
          }
          const before = await performanceMetrics(page)
          const sampled = await evaluateWithHeartbeat(page, 'window.compareBench.sample()')
          const after = await performanceMetrics(page)
          await evaluate(page, 'window.compareBench.teardown()')
          assertScrolled(info.id, sampled)
          const taskSeconds = Math.max(0, after.TaskDuration - before.TaskDuration)
          measured.push({ prepared, sampled, taskSeconds })
          process.stderr.write(
            ` visible ${prepared.actualVisibleBars.toFixed(0)}, ` +
              `work P50 ${percentile(sampled.frameWorkMs, 0.5).toFixed(2)} ms, ` +
              `P99 ${percentile(sampled.frameWorkMs, 0.99).toFixed(2)} ms, ` +
              `main ${((taskSeconds * 1000) / sampled.frameIntervalsMs.length).toFixed(2)} ms/frame\n`,
          )
        }
        scenarios.push(summarize(info, visibleBars, measured, refreshIntervalMs))
      }
    }

    const libraries = {}
    for (const info of subjects) {
      libraries[info.packageName] = await packageVersion(info.packageName)
    }
    const git = async (...args) =>
      (await execFileAsync('git', args, { cwd: repoDir })).stdout.trim()
    const report = {
      schemaVersion: 1,
      kind: 'library-comparison',
      generatedAt: new Date().toISOString(),
      // dirty 为真表示实测代码 = commit + 未提交改动，发布前应提交后重跑。
      git: {
        branch: await git('branch', '--show-current'),
        commit: await git('rev-parse', 'HEAD'),
        dirty: (await git('status', '--porcelain')).length > 0,
      },
      environment: {
        os: `${process.platform} ${process.arch}`,
        cpu: cpus()[0]?.model ?? null,
        memoryGiB: Math.round(totalmem() / 1024 ** 3),
        node: process.version,
        browserVersion: identity.browserVersion,
        cdpGpu: identity.systemInfo.gpu,
        pageGpu: identity.pageGpu,
        // 临时 profile 目录是本机路径，报告要公开发布，只保留占位。
        chromeArgs: chromeArgs.map((arg) => arg.replace(profileDir, '<profile>')),
      },
      configuration: {
        build: 'vite production',
        width,
        height,
        dpr,
        warmupFrames,
        sampleFrames,
        rounds,
        requestedVisibleBars,
        visibleBarTierProbe: TIER_PROBE_SUBJECT,
        visibleBars: visibleBarSets,
        refreshIntervalMs,
        frameOverheadP50Ms,
        droppedFrameMultiplier: DROPPED_FRAME_MULTIPLIER,
        scrollPerFrameBars: 1,
      },
      libraries,
      subjects,
      scenarios,
    }
    await writeFile(resolve(resultsDir, 'compare-local.json'), `${JSON.stringify(report, null, 2)}\n`)
    await writeFile(resolve(resultsDir, 'compare-local.csv'), toCsv(scenarios))
    process.stdout.write(`Results: ${resolve(resultsDir, 'compare-local.json')}\n`)
  } finally {
    await closeBenchSession({ page, browser, chrome, server, profileDir })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
