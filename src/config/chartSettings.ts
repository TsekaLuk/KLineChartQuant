/**
 * 图表设置配置
 */

export interface SettingItem {
  key: string
  label: string
  type: 'boolean' | 'select'
  default: boolean | string
  group?: string
  options?: { value: string; label: string }[]
}

/**
 * 检测是否为移动端设备
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent.toLowerCase()
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|touch/.test(userAgent)
}

/** 默认设置配置 */
export const DEFAULT_SETTINGS = [
  { key: 'showVolumePriceMarkers', label: '显示量价关系标记', type: 'boolean', default: false, group: 'main' },
  { key: 'logarithmicScale', label: '对数价格轴', type: 'boolean', default: false, group: 'main' },
  { key: 'disableMainPaneVerticalScroll', label: '主图纵轴刻度自适应调整', type: 'boolean', default: true, group: 'main' },
  { key: 'enableWebGLRendering', label: '启用 WebGL 硬件加速渲染', type: 'boolean', default: true, group: 'main' },
  {
    key: 'webglLineAA',
    label: 'WebGL 线条抗锯齿',
    type: 'select',
    default: 'shader',
    group: 'main',
    options: [
      { value: 'msaa', label: '4x MSAA（高质量）' },
      { value: 'shader', label: '着色器抗锯齿（高性能）' },
    ],
  },
  { key: 'performanceTest10kKlines', label: '万条K线性能测试', type: 'boolean', default: false, group: 'experimental' },
  { key: 'enableCanvasProfiler', label: 'Canvas 性能分析插桩', type: 'boolean', default: false, group: 'experimental' },
] as const

/** 图表设置类型（从 DEFAULT_SETTINGS 自动推导，同时兼容扩展） */
export type ChartSettings = {
  [K in (typeof DEFAULT_SETTINGS)[number]['key']]?: K extends 'webglLineAA' ? string : boolean
} & Record<string, boolean | string>

/** localStorage 存储键名 */
export const SETTINGS_STORAGE_KEY = 'kline-chart-settings'
