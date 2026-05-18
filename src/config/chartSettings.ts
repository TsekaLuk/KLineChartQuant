/**
 * 图表设置配置
 */

export interface SettingItem {
  key: string
  label: string
  type: 'boolean'
  default: boolean
}

/** 默认设置配置 */
export const DEFAULT_SETTINGS: SettingItem[] = [
  { key: 'showVolumePriceMarkers', label: '显示量价关系标记', type: 'boolean', default: true },
  { key: 'logarithmicScale', label: '对数价格轴', type: 'boolean', default: false },
]

/** localStorage 存储键名 */
export const SETTINGS_STORAGE_KEY = 'kline-chart-settings'
