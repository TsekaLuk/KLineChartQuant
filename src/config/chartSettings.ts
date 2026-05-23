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
export const DEFAULT_SETTINGS: SettingItem[] = [
  { key: 'showVolumePriceMarkers', label: '显示量价关系标记', type: 'boolean', default: true, group: 'main' },
  { key: 'logarithmicScale', label: '对数价格轴', type: 'boolean', default: false, group: 'main' },
  { key: 'disableMainPaneVerticalScroll', label: '主图纵轴刻度自适应调整', type: 'boolean', default: true, group: 'experimental' },
]

/** localStorage 存储键名 */
export const SETTINGS_STORAGE_KEY = 'kline-chart-settings'
