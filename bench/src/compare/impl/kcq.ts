/**
 * KCQ 适配器：通过公开 createChartController 挂载完整图表（Scene、坐标轴、指标管线全部参与），
 * 按数据集周期表生成一个均线脚本指标，经内置脚本服务注册后挂载，用 scrollByBars 滚动。三个渲染后端共用这一份实现。
 */

import type { ScriptService } from '@363045841yyt/klinechart-script-chart'
import { createBuiltinScriptService } from '@363045841yyt/klinechart-script-chart'
import type {
  ChartController,
  RendererBackend,
} from '../../../../packages/core/src/controllers/index'
import { createChartController } from '../../../../packages/core/src/controllers/index'
import { nextAnimationFrame } from '../../probe'
import type { BenchDataset, ChartSubject, MaLineCount, VisibleRange } from '../types'
import { maColor } from './scene'

/** 允许 1 个物理像素宽的 K 线，使千根级可见窗口可达。 */
const MIN_K_WIDTH = 0.5
/** 细分缩放档位，让任意目标可见根数都能找到最接近的公开缩放级别。 */
const ZOOM_LEVELS = 2_000
/** 等待指标首次结果的上限；超时说明计算卡住，场景直接作废。 */
const INDICATOR_READY_TIMEOUT_MS = 30_000

// 均线是脚本指标，与应用一样由脚本服务注册进 core 定义仓库；服务随页面存活，只建一次。
// 不读写持久化：基准每次从干净的定义仓库开始，不恢复上次保存的脚本。
let builtinScripts: Promise<ScriptService> | null = null
// 每个均线档位只注册一次，值为注册后的指标定义 id。
const maDefinitions = new Map<MaLineCount, Promise<string>>()

/** 返回页面级脚本服务；首次调用时启动 Worker 并注册全部内置脚本指标。 */
function ensureBuiltinScripts(): Promise<ScriptService> {
  builtinScripts ??= createBuiltinScriptService({
    persistence: { load: async () => [], save: async () => true },
  })
  return builtinScripts
}

/**
 * 生成均线脚本源码：写法与内置 MA 相同，每个周期一条 plot.Line，颜色取各库共用的场景配色。
 *
 * @param dataset - 提供均线档位与周期表
 * @returns 可直接交给 ScriptService.create 的源码
 */
function movingAverageSource(dataset: BenchDataset): string {
  const plots = dataset.maPeriods
    .map(
      (period, line) =>
        `plot.Line(ta.sma(close, ${period}), 'ma${line + 1}', { label: 'MA${period}', color: '${maColor(line)}' })`,
    )
    .join('\n    ')
  return `defineIndicator({
  name: 'BenchMA${dataset.maLines}',
  title: 'Bench MA ${dataset.maLines}',
  info: 'Benchmark moving averages',
  position: Position.Main,
  onBar() {
    ${plots}
  },
})`
}

/**
 * 注册数据集对应的均线指标并返回其定义 id；同一档位只注册一次。
 * 以信任模式注册，与内置 MA 走同一个原生执行引擎，计算成本与应用里的内置指标一致。
 */
function ensureMovingAverages(dataset: BenchDataset): Promise<string> {
  const cached = maDefinitions.get(dataset.maLines)
  if (cached) return cached
  const created = ensureBuiltinScripts()
    .then((scripts) => scripts.create(movingAverageSource(dataset), true))
    .then((document) => document.id)
  maDefinitions.set(dataset.maLines, created)
  return created
}

/** 读取当前可见根数。 */
function visibleCount(controller: ChartController): number {
  const viewport = controller.viewport.peek()
  return viewport.visibleTo - viewport.visibleFrom
}

/**
 * 等待指标首次结果落地：它的图例行不再加载、没有错误且已带数值。
 * 脚本指标在 Worker 里异步计算；若结果在采样中途到达，计算回传与首绘会被算进滚动帧。
 * 主图指标每个定义只启用一个实例，按定义 id 找图例行（图例的 instanceId 带 pane 前缀，与 addIndicator 的返回值不同）。
 *
 * @param controller - 已挂载的控制器
 * @param definitionId - 指标定义 id
 */
async function waitForIndicatorReady(
  controller: ChartController,
  definitionId: string,
): Promise<void> {
  const started = performance.now()
  for (;;) {
    const row = controller.legend.rows
      .peek()
      .find((candidate) => candidate.indicator?.definitionId === definitionId)
    if (row?.error) throw new Error(`KCQ indicator ${definitionId} failed: ${row.error}`)
    // 加载中的行只有指标名一段文本，算完后才追加各条均线的数值。
    if (row && row.loading !== true && row.texts.length > 1) return
    if (performance.now() - started > INDICATOR_READY_TIMEOUT_MS) {
      throw new Error(
        `KCQ indicator ${definitionId} did not finish within ${INDICATOR_READY_TIMEOUT_MS} ms`,
      )
    }
    await nextAnimationFrame()
  }
}

/**
 * 缩放到可见根数最接近目标的级别，并贴齐最新一根。
 * 级别越大 K 线越宽、可见根数越少；K 线宽度按物理像素取整，所以只能取到离散的可见根数。
 */
function zoomToVisibleBars(controller: ChartController, target: number): void {
  let low = 1
  let high = controller.getZoomLevelCount()
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    controller.zoomToLevel(middle)
    if (visibleCount(controller) > target) low = middle + 1
    else high = middle
  }
  controller.zoomToLevel(low)
  // low 是首个不超过目标的级别，前一级是首个超过目标的级别，两者取更接近目标的一个。
  const below = visibleCount(controller)
  if (low > 1) {
    controller.zoomToLevel(low - 1)
    if (visibleCount(controller) - target > target - below) controller.zoomToLevel(low)
  }
  // 缩放以中心为锚，其他库挂载后都停在最新一根，这里同样贴右，保证画的是同一段数据。
  controller.scrollToRight()
}

/**
 * 创建 KCQ 适配器。
 *
 * @param backend - 渲染后端偏好；挂载后若实际后端不同会直接失败，避免静默降级污染结果
 */
export function createKcqSubject(backend: RendererBackend): ChartSubject {
  let controller: ChartController | null = null

  function mounted(): ChartController {
    if (!controller) throw new Error(`KCQ (${backend}) is not mounted`)
    return controller
  }

  return {
    async mount(container, dataset, visibleBars) {
      const definitionId = await ensureMovingAverages(dataset)
      controller = await createChartController({
        container,
        data: dataset.bars,
        theme: 'dark',
        minKWidth: MIN_K_WIDTH,
        zoomLevels: ZOOM_LEVELS,
        settings: { rendererBackend: backend },
      })
      // 控制器会从 IndexedDB 恢复并自动保存布局（指标、缩放、滚动）。在添加指标前关掉自动保存：
      // 每次运行用全新的 Chrome profile，首个场景落盘的是干净默认布局，之后每个场景都恢复这份干净布局，
      // 不会带入上一个场景的指标；采样期间也不写 IndexedDB，竞品没有持久化，只比绘制。
      await controller.setLayoutAutoSave({ enabled: false })
      await controller.loadIndicators([definitionId])
      if (!controller.addIndicator(definitionId)) {
        throw new Error(`KCQ (${backend}) rejected the ${definitionId} indicator`)
      }
      zoomToVisibleBars(controller, visibleBars)
      await waitForIndicatorReady(controller, definitionId)
    },
    scrollOneBar() {
      mounted().scrollByBars(-1)
    },
    visibleRange(): VisibleRange {
      const viewport = mounted().viewport.peek()
      return { from: viewport.visibleFrom, to: viewport.visibleTo }
    },
    async destroy() {
      await mounted().dispose()
      controller = null
    },
  }
}
