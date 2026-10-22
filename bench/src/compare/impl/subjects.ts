/** 被测对象注册表：身份与适配器工厂的唯一映射，页面与运行器都从这里取清单与顺序。 */

import type { SubjectEntry } from '../types'
import { createEChartsSubject } from './echarts'
import { createKcqSubject } from './kcq'
import { createKLineChartsSubject } from './klinecharts'
import { createLightweightChartsSubject } from './lightweightCharts'

const KCQ_PACKAGE = '@363045841yyt/klinechart-core'

export const SUBJECTS: readonly SubjectEntry[] = [
  {
    info: { id: 'kcq-webgl', library: 'KLineChartQuant', packageName: KCQ_PACKAGE, renderer: 'WebGL2' },
    create: () => createKcqSubject('webgl'),
  },
  {
    info: { id: 'kcq-webgpu', library: 'KLineChartQuant', packageName: KCQ_PACKAGE, renderer: 'WebGPU' },
    create: () => createKcqSubject('webgpu'),
  },
  {
    info: { id: 'kcq-canvas', library: 'KLineChartQuant', packageName: KCQ_PACKAGE, renderer: 'Canvas2D' },
    create: () => createKcqSubject('canvas'),
  },
  {
    info: {
      id: 'lightweight-charts',
      library: 'Lightweight Charts',
      packageName: 'lightweight-charts',
      renderer: 'Canvas2D',
    },
    create: createLightweightChartsSubject,
  },
  {
    info: { id: 'echarts', library: 'Apache ECharts', packageName: 'echarts', renderer: 'Canvas2D' },
    create: createEChartsSubject,
  },
  {
    info: { id: 'klinecharts', library: 'KLineChart', packageName: 'klinecharts', renderer: 'Canvas2D' },
    create: createKLineChartsSubject,
  },
]

/** 按 id 取注册表条目；未知 id 直接失败。 */
export function findSubject(id: string): SubjectEntry {
  const entry = SUBJECTS.find((candidate) => candidate.info.id === id)
  if (!entry) throw new Error(`Unknown benchmark subject: ${id}`)
  return entry
}
