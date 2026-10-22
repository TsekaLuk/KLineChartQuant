/**
 * 图表库对比基准页面：按场景挂载被测库，预热后逐帧滚动一根 K 线并记录 rAF 间隔。
 * 页面只暴露确定性的测试 API；主线程计时、截图、统计与落盘由 compare.mjs 完成。
 */

import { inspectGpu, jsHeapUsed, measureRefreshIntervals, nextAnimationFrame } from '../probe'
import { createBenchDataset } from './impl/dataset'
import { SCENE_COLORS } from './impl/scene'
import { findSubject, SUBJECTS } from './impl/subjects'
import type {
  ChartSubject,
  CompareScenarioOptions,
  PreparedScenario,
  SampledScenario,
  SubjectInfo,
} from './types'

declare global {
  interface Window {
    compareBench: {
      subjects: () => SubjectInfo[]
      inspectGpu: () => Promise<Record<string, unknown>>
      measureRefreshIntervals: (frames: number) => Promise<number[]>
      measureFrameOverhead: (frames: number) => Promise<number[]>
      prepare: (options: CompareScenarioOptions) => Promise<PreparedScenario>
      sample: () => Promise<SampledScenario>
      teardown: () => Promise<void>
    }
  }
}

/** 挂载后等待的帧数：覆盖异步指标计算与各库自己的 rAF 首绘。 */
const SETTLE_FRAMES = 30
/** 采样结束后多等的帧数，让最后一次滚动落到视口状态里再读取区间。 */
const TAIL_FRAMES = 2

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app is missing')
const root = app
const dataset = createBenchDataset()
let active: { subject: ChartSubject; options: CompareScenarioOptions } | null = null

/** 等待若干帧。 */
async function waitFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await nextAnimationFrame()
}

/** 读取当前场景；未挂载时直接失败。 */
function current(): { subject: ChartSubject; options: CompareScenarioOptions } {
  if (!active) throw new Error('No scenario is prepared')
  return active
}

/** 挂载被测库并预热：首绘、指标计算与 JIT 都在采样前完成。 */
async function prepare(options: CompareScenarioOptions): Promise<PreparedScenario> {
  if (active) throw new Error('The previous scenario was not torn down')
  const container = document.createElement('div')
  container.style.cssText = `position:relative;width:${options.width}px;height:${options.height}px;background:${SCENE_COLORS.background}`
  root.replaceChildren(container)
  const subject = findSubject(options.subject).create()
  const started = performance.now()
  await subject.mount(container, dataset, options.visibleBars)
  const mountMs = performance.now() - started
  active = { subject, options }
  await waitFrames(SETTLE_FRAMES)
  for (let index = 0; index < options.warmupFrames; index += 1) {
    subject.scrollOneBar()
    await nextAnimationFrame()
  }
  await waitFrames(TAIL_FRAMES)
  const range = subject.visibleRange()
  return { mountMs, actualVisibleBars: range.to - range.from }
}

/**
 * 测量一帧的工作量：先同步调用滚动，再等下一帧。库在滚动里登记的 rAF 回调排在我们的等待之前，
 * 因此「回调开始时 performance.now() − 帧时间戳」就是本帧库在 rAF 里花掉的时间。
 *
 * @param scroll - 本帧要执行的滚动；为 null 时只测空帧开销
 * @returns 本帧工作量与该帧的 rAF 时间戳
 */
async function measureFrame(scroll: (() => void) | null): Promise<{ workMs: number; timestamp: number }> {
  const started = performance.now()
  scroll?.()
  const scrollMs = performance.now() - started
  const timestamp = await nextAnimationFrame()
  return { workMs: scrollMs + (performance.now() - timestamp), timestamp }
}

/** 不挂载任何库时的单帧测量开销，写进报告作为基线。 */
async function measureFrameOverhead(frames: number): Promise<number[]> {
  const overhead: number[] = []
  for (let index = 0; index < frames; index += 1) overhead.push((await measureFrame(null)).workMs)
  return overhead
}

/** 采样：每帧滚动一根，记录单帧工作量与 rAF 间隔；同时核验视口确实移动了。 */
async function sample(): Promise<SampledScenario> {
  const { subject, options } = current()
  const before = subject.visibleRange()
  const frameWorkMs: number[] = []
  const frameIntervalsMs: number[] = []
  let previous = await nextAnimationFrame()
  for (let index = 0; index < options.sampleFrames; index += 1) {
    const { workMs, timestamp } = await measureFrame(() => subject.scrollOneBar())
    frameWorkMs.push(workMs)
    frameIntervalsMs.push(timestamp - previous)
    previous = timestamp
  }
  await waitFrames(TAIL_FRAMES)
  const after = subject.visibleRange()
  return {
    frameWorkMs,
    frameIntervalsMs,
    scrolledBars: before.from - after.from,
    jsHeapUsedBytes: jsHeapUsed(),
  }
}

/** 销毁当前场景并清空容器，下一个场景从干净的 DOM 开始。 */
async function teardown(): Promise<void> {
  const { subject } = current()
  await subject.destroy()
  root.replaceChildren()
  active = null
}

window.compareBench = {
  subjects: () => SUBJECTS.map((entry) => entry.info),
  inspectGpu,
  measureRefreshIntervals,
  measureFrameOverhead,
  prepare,
  sample,
  teardown,
}
document.body.dataset.ready = 'true'
