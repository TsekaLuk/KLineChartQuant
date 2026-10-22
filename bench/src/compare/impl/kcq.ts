/**
 * KCQ 适配器：通过公开 createChartController 挂载完整图表（Scene、坐标轴、指标管线全部参与），
 * 经内置脚本服务注册 MA 指标后挂载，用 scrollByBars 滚动。三个渲染后端共用这一份实现。
 */

import { createBuiltinScriptService } from '@363045841yyt/klinechart-script-chart'
import type { ScriptService } from '@363045841yyt/klinechart-script-chart'
import { createChartController } from '../../../../packages/core/src/controllers/index'
import type {
  ChartController,
  RendererBackend,
} from '../../../../packages/core/src/controllers/index'
import type { ChartSubject, VisibleRange } from '../types'

/** 内置均线指标的定义 id；默认五个周期与 MA_PERIODS 一致。 */
const MA_DEFINITION_ID = 'MA'
/** 允许 1 个物理像素宽的 K 线，使千根级可见窗口可达。 */
const MIN_K_WIDTH = 0.5
/** 细分缩放档位，让任意目标可见根数都能找到最接近的公开缩放级别。 */
const ZOOM_LEVELS = 2_000

// MA 是 QuickJS 脚本指标，与应用一样由内置脚本服务注册进 core 定义仓库；服务随页面存活，只建一次。
let builtinScripts: Promise<ScriptService> | null = null

/** 返回页面级内置脚本服务；首次调用时启动 Worker 并注册全部内置脚本指标。 */
function ensureBuiltinScripts(): Promise<ScriptService> {
  builtinScripts ??= createBuiltinScriptService()
  return builtinScripts
}

/** 读取当前可见根数。 */
function visibleCount(controller: ChartController): number {
  const viewport = controller.viewport.peek()
  return viewport.visibleTo - viewport.visibleFrom
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
      await ensureBuiltinScripts()
      controller = await createChartController({
        container,
        data: dataset.bars,
        theme: 'dark',
        minKWidth: MIN_K_WIDTH,
        zoomLevels: ZOOM_LEVELS,
        settings: { rendererBackend: backend },
      })
      await controller.loadIndicators([MA_DEFINITION_ID])
      if (!controller.addIndicator(MA_DEFINITION_ID)) {
        throw new Error(`KCQ (${backend}) rejected the ${MA_DEFINITION_ID} indicator`)
      }
      zoomToVisibleBars(controller, visibleBars)
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
