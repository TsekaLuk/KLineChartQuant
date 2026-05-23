/**
 * 图表设置配置
 */

export interface SettingItem {
  key: string
  label: string
  type: 'boolean'
  default: boolean
  group?: string
}

/** 默认设置配置 */
export const DEFAULT_SETTINGS = [
  { key: 'showVolumePriceMarkers', label: '显示量价关系标记', type: 'boolean', default: true, group: 'main' },
  { key: 'logarithmicScale', label: '对数价格轴', type: 'boolean', default: false, group: 'main' },
  { key: 'disableMainPaneVerticalScroll', label: '主图纵轴刻度自适应调整', type: 'boolean', default: true, group: 'experimental' },
  { key: 'performanceTest10kKlines', label: '万条K线性能测试', type: 'boolean', default: false, group: 'experimental' },
] as const

/** 图表设置类型（从 DEFAULT_SETTINGS 自动推导，同时兼容扩展） */
export type ChartSettings = {
  [K in (typeof DEFAULT_SETTINGS)[number]['key']]?: boolean
} & Record<string, boolean>

/** localStorage 存储键名 */
export const SETTINGS_STORAGE_KEY = 'kline-chart-settings'
