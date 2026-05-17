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
]

/** localStorage 存储键名 */
export const SETTINGS_STORAGE_KEY = 'kline-chart-settings'
