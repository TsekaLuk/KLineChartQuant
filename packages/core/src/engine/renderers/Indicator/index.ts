/**
 * 指标渲染器导出入口
 */

import type { RendererPlugin } from '../../../plugin'
import { createVolumeRendererPlugin } from '../subVolume'

// MA 均线
export { createMARendererPlugin, type MAFlags } from './ma'

// BOLL 布林带
export { createBOLLRendererPlugin } from './boll'

// EXPMA 指数平滑移动平均线
export { createEXPMARendererPlugin } from './expma'

// ENE 轨道线
export { createENERendererPlugin } from './ene'

// 主图指标图例（统一管理 MA、BOLL 等）
export { createMainIndicatorLegendRendererPlugin } from './mainIndicatorLegend'

// MACD
export { createMACDRendererPlugin, calcMACDAtIndex, type MACDConfig, type MACDRendererOptions, getMACDTitleInfo } from './macd'
export { createMACDLegendRendererPlugin, type MACDLegendOptions } from './macdLegend'

// RSI 相对强弱指标
export { createRSIRendererPlugin, type RSIRendererOptions, getRSITitleInfo } from './rsi'

// CCI 顺势指标
export { createCCIRendererPlugin, type CCIRendererOptions, getCCITitleInfo } from './cci'

// STOCH 随机指标
export { createSTOCHRendererPlugin, type STOCHRendererOptions, getSTOCHTitleInfo } from './stoch'

// MOM 动量指标
export { createMOMRendererPlugin, type MOMRendererOptions, getMOMTitleInfo } from './mom'

// WMSR 威廉指标
export { createWMSRRendererPlugin, type WMSRRendererOptions, getWMSRTitleInfo } from './wmsr'

// KST 确知指标
export { createKSTRendererPlugin, type KSTRendererOptions, getKSTTitleInfo } from './kst'

// FASTK 快速随机指标
export { createFASTKRendererPlugin, type FASTKRendererOptions, getFASTKTitleInfo } from './fastk'

// ATR 平均真实波幅
export { createATRRendererPlugin, type ATRRendererOptions, getATRTitleInfo } from './atr'

// WMA 加权移动平均
export { createWMARendererPlugin } from './wma'
// DEMA 双指数移动平均
export { createDEMARendererPlugin } from './dema'
// TEMA 三指数移动平均
export { createTEMARendererPlugin } from './tema'
// HMA 赫尔移动平均
export { createHMARendererPlugin } from './hma'
// KAMA 考夫曼自适应移动平均
export { createKAMARendererPlugin } from './kama'
// SAR 抛物线转向
export { createSARRendererPlugin } from './sar'
// SuperTrend 超级趋势
export { createSuperTrendRendererPlugin } from './supertrend'
// Keltner 肯特纳通道
export { createKeltnerRendererPlugin } from './keltner'
// Donchian 唐奇安通道
export { createDonchianRendererPlugin } from './donchian'
// Ichimoku 一目均衡表
export { createIchimokuRendererPlugin } from './ichimoku'
// ROC 变化率
export { createROCRendererPlugin } from './roc'
// TRIX 三重指数平滑平均
export { createTRIXRendererPlugin } from './trix'
// HV 历史波动率
export { createHVRendererPlugin } from './hv'
// Parkinson 帕金森波动率
export { createParkinsonRendererPlugin } from './parkinson'
// Chaikin Vol 蔡金波动率
export { createChaikinVolRendererPlugin } from './chaikinVol'
// VMA 成交量移动平均
export { createVMARendererPlugin } from './vma'
// OBV 能量潮
export { createOBVRendererPlugin } from './obv'
// PVT 价量趋势
export { createPVTRendererPlugin } from './pvt'
// VWAP 成交量加权均价
export { createVWAPRendererPlugin } from './vwap'
// CMF 蔡金资金流
export { createCMFRendererPlugin } from './cmf'
// MFI 资金流量指数
export { createMFIRendererPlugin } from './mfi'
// Pivot Points 枢轴点
export { createPivotRendererPlugin } from './pivot'
// Fibonacci 斐波那契
export { createFibRendererPlugin } from './fib'
// SMC Structure 结构
export { createStructureRendererPlugin } from './structure'
// SMC Zones 区域
export { createZonesRendererPlugin } from './zones'
// Volume Profile 成交量分布
export { createVolumeProfileRendererPlugin } from './volumeProfile'

/**
 * 副图指标类型
 */
export type SubIndicatorType = 'VOLUME' | 'MACD' | 'RSI' | 'CCI' | 'STOCH' | 'MOM' | 'WMSR' | 'KST' | 'FASTK' | 'ATR'
    | 'WMA' | 'DEMA' | 'TEMA' | 'HMA' | 'KAMA' | 'SAR' | 'SUPERTREND' | 'KELTNER' | 'DONCHIAN' | 'ICHIMOKU'
    | 'ROC' | 'TRIX' | 'HV' | 'PARKINSON' | 'CHAIKIN_VOL' | 'VMA' | 'OBV' | 'PVT' | 'VWAP'
    | 'CMF' | 'MFI' | 'PIVOT' | 'FIB' | 'STRUCTURE' | 'ZONES' | 'VOLUME_PROFILE'

/**
 * 渲染器工厂选项
 */
export interface IndicatorRendererOptions {
    /** 指标类型 */
    indicatorId: SubIndicatorType
    /** 目标 pane ID */
    paneId: string
}

// 导入各个创建函数用于工厂函数
import { createMACDRendererPlugin } from './macd'
import { createRSIRendererPlugin } from './rsi'
import { createCCIRendererPlugin } from './cci'
import { createSTOCHRendererPlugin } from './stoch'
import { createMOMRendererPlugin } from './mom'
import { createWMSRRendererPlugin } from './wmsr'
import { createKSTRendererPlugin } from './kst'
import { createFASTKRendererPlugin } from './fastk'
import { createATRRendererPlugin } from './atr'
import { createWMARendererPlugin } from './wma'
import { createDEMARendererPlugin } from './dema'
import { createTEMARendererPlugin } from './tema'
import { createHMARendererPlugin } from './hma'
import { createKAMARendererPlugin } from './kama'
import { createSARRendererPlugin } from './sar'
import { createSuperTrendRendererPlugin } from './supertrend'
import { createKeltnerRendererPlugin } from './keltner'
import { createDonchianRendererPlugin } from './donchian'
import { createIchimokuRendererPlugin } from './ichimoku'
import { createROCRendererPlugin } from './roc'
import { createTRIXRendererPlugin } from './trix'
import { createHVRendererPlugin } from './hv'
import { createParkinsonRendererPlugin } from './parkinson'
import { createChaikinVolRendererPlugin } from './chaikinVol'
import { createVMARendererPlugin } from './vma'
import { createOBVRendererPlugin } from './obv'
import { createPVTRendererPlugin } from './pvt'
import { createVWAPRendererPlugin } from './vwap'
import { createCMFRendererPlugin } from './cmf'
import { createMFIRendererPlugin } from './mfi'
import { createPivotRendererPlugin } from './pivot'
import { createFibRendererPlugin } from './fib'
import { createStructureRendererPlugin } from './structure'
import { createZonesRendererPlugin } from './zones'
import { createVolumeProfileRendererPlugin } from './volumeProfile'

/**
 * 创建副图指标渲染器（统一工厂函数）
 */
export function createSubIndicatorRenderer(options: IndicatorRendererOptions): RendererPlugin {
    const { indicatorId, paneId } = options

    switch (indicatorId) {
        case 'VOLUME':
            return createVolumeRendererPlugin({ paneId })
        case 'MACD':
            return createMACDRendererPlugin({ paneId })
        case 'RSI':
            return createRSIRendererPlugin({ paneId })
        case 'CCI':
            return createCCIRendererPlugin({ paneId })
        case 'STOCH':
            return createSTOCHRendererPlugin({ paneId })
        case 'MOM':
            return createMOMRendererPlugin({ paneId })
        case 'WMSR':
            return createWMSRRendererPlugin({ paneId })
        case 'KST':
            return createKSTRendererPlugin({ paneId })
        case 'FASTK':
            return createFASTKRendererPlugin({ paneId })
        case 'ATR':
            return createATRRendererPlugin({ paneId })
        case 'WMA':
            return createWMARendererPlugin({ paneId })
        case 'DEMA':
            return createDEMARendererPlugin({ paneId })
        case 'TEMA':
            return createTEMARendererPlugin({ paneId })
        case 'HMA':
            return createHMARendererPlugin({ paneId })
        case 'KAMA':
            return createKAMARendererPlugin({ paneId })
        case 'SAR':
            return createSARRendererPlugin({ paneId })
        case 'SUPERTREND':
            return createSuperTrendRendererPlugin({ paneId })
        case 'KELTNER':
            return createKeltnerRendererPlugin({ paneId })
        case 'DONCHIAN':
            return createDonchianRendererPlugin({ paneId })
        case 'ICHIMOKU':
            return createIchimokuRendererPlugin({ paneId })
        case 'ROC':
            return createROCRendererPlugin({ paneId })
        case 'TRIX':
            return createTRIXRendererPlugin({ paneId })
        case 'HV':
            return createHVRendererPlugin({ paneId })
        case 'PARKINSON':
            return createParkinsonRendererPlugin({ paneId })
        case 'CHAIKIN_VOL':
            return createChaikinVolRendererPlugin({ paneId })
        case 'VMA':
            return createVMARendererPlugin({ paneId })
        case 'OBV':
            return createOBVRendererPlugin({ paneId })
        case 'PVT':
            return createPVTRendererPlugin({ paneId })
        case 'VWAP':
            return createVWAPRendererPlugin({ paneId })
        case 'CMF':
            return createCMFRendererPlugin({ paneId })
        case 'MFI':
            return createMFIRendererPlugin({ paneId })
        case 'PIVOT':
            return createPivotRendererPlugin({ paneId })
        case 'FIB':
            return createFibRendererPlugin({ paneId })
        case 'STRUCTURE':
            return createStructureRendererPlugin({ paneId })
        case 'ZONES':
            return createZonesRendererPlugin({ paneId })
        case 'VOLUME_PROFILE':
            return createVolumeProfileRendererPlugin({ paneId })
        default:
            throw new Error(`Unknown indicator: ${indicatorId}`)
    }
}
