/**
 * State Composer
 * 把 Worker/Runtime 返回的 series bundle 组装成与现有兼容的 render states
 */

import type {
    MARenderState,
} from './maState'
import type {
    BOLLRenderState,
} from './bollState'
import type {
    EXPMARenderState,
} from './expmaState'
import type {
    ENERenderState,
} from './eneState'
import type {
    RSIRenderState,
} from './rsiState'
import type {
    CCIRenderState,
} from './cciState'
import type {
    STOCHRenderState,
} from './stochState'
import type {
    MOMRenderState,
} from './momState'
import type {
    WMSRRenderState,
} from './wmsrState'
import type {
    KSTRenderState,
} from './kstState'
import type {
    FASTKRenderState,
} from './fastkState'
import type {
    MACDRenderState,
} from './macdState'
import type { IndicatorSeriesBundle } from './workerProtocol'

/**
 * 可见范围
 */
interface VisibleRange {
    start: number
    end: number
}

type VisibleSubIndicatorStates = {
    rsi: RSIRenderState
    cci: CCIRenderState
    stoch: STOCHRenderState
    mom: MOMRenderState
    wmsr: WMSRRenderState
    kst: KSTRenderState
    fastk: FASTKRenderState
    macd: MACDRenderState
}

type ComposedRenderStates = VisibleSubIndicatorStates & {
    ma: MARenderState
    boll: BOLLRenderState
    expma: EXPMARenderState
    ene: ENERenderState
}

function getLatestMACDPoint(bundle: IndicatorSeriesBundle, visibleRange: VisibleRange) {
    const latestIndex = visibleRange.end - 1
    return latestIndex >= 0 && latestIndex < bundle.macd.series.length
        ? bundle.macd.series[latestIndex]
        : null
}

/**
 * 仅计算副图指标的 visible-only states
 * 用于滚动时的轻量更新，避免重复计算主图指标
 */
export function composeVisibleSubIndicatorStates(
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    timestamp: number
): VisibleSubIndicatorStates {
    const rsiExtremes = calcRSIExtremes(bundle.rsi.series, visibleRange)
    const cciExtremes = calcCCIExtremes(bundle.cci.series, visibleRange)
    const stochExtremes = calcSTOCHExtremes(bundle.stoch.series, visibleRange)
    const momExtremes = calcMOMExtremes(bundle.mom.series, visibleRange)
    const wmsrExtremes = calcWMSRExtremes(bundle.wmsr.series, visibleRange)
    const kstExtremes = calcKSTExtremes(bundle.kst.series, visibleRange)
    const fastkExtremes = calcFASTKExtremes(bundle.fastk.series, visibleRange)
    const macdExtremes = calcMACDExtremes(bundle.macd.series, visibleRange)
    const latestPoint = getLatestMACDPoint(bundle, visibleRange)

    const macdPadding = Math.max(Math.abs(macdExtremes.max), Math.abs(macdExtremes.min)) * 0.1
    const macdValueMin = Number.isFinite(macdExtremes.min) ? macdExtremes.min - macdPadding : macdExtremes.min
    const macdValueMax = Number.isFinite(macdExtremes.max) ? macdExtremes.max + macdPadding : macdExtremes.max

    const cciValueMin = Math.min(cciExtremes.min, -150)
    const cciValueMax = Math.max(cciExtremes.max, 150)

    const momPadding = Math.max(Math.abs(momExtremes.max), Math.abs(momExtremes.min)) * 0.1
    const momValueMin = momExtremes.min - momPadding
    const momValueMax = momExtremes.max + momPadding

    const kstRange = kstExtremes.max - kstExtremes.min
    const kstPadding = kstRange * 0.1
    const kstValueMin = kstExtremes.min - kstPadding
    const kstValueMax = kstExtremes.max + kstPadding

    return {
        rsi: {
            timestamp,
            series: bundle.rsi.series,
            enabledPeriods: bundle.rsi.enabledPeriods,
            params: bundle.rsi.params,
            valueMin: 0,
            valueMax: 100,
            visibleMin: rsiExtremes.min,
            visibleMax: rsiExtremes.max,
        },
        cci: {
            timestamp,
            series: bundle.cci.series,
            params: bundle.cci.params,
            valueMin: cciValueMin,
            valueMax: cciValueMax,
            visibleMin: cciExtremes.min,
            visibleMax: cciExtremes.max,
        },
        stoch: {
            timestamp,
            series: bundle.stoch.series,
            params: bundle.stoch.params,
            valueMin: 0,
            valueMax: 100,
            visibleMin: stochExtremes.min,
            visibleMax: stochExtremes.max,
        },
        mom: {
            timestamp,
            series: bundle.mom.series,
            params: bundle.mom.params,
            valueMin: momValueMin,
            valueMax: momValueMax,
            visibleMin: momExtremes.min,
            visibleMax: momExtremes.max,
        },
        wmsr: {
            timestamp,
            series: bundle.wmsr.series,
            params: bundle.wmsr.params,
            valueMin: -100,
            valueMax: 0,
            visibleMin: wmsrExtremes.min,
            visibleMax: wmsrExtremes.max,
        },
        kst: {
            timestamp,
            series: bundle.kst.series,
            params: bundle.kst.params,
            valueMin: kstValueMin,
            valueMax: kstValueMax,
            visibleMin: kstExtremes.min,
            visibleMax: kstExtremes.max,
        },
        fastk: {
            timestamp,
            series: bundle.fastk.series,
            params: bundle.fastk.params,
            valueMin: 0,
            valueMax: 100,
            visibleMin: fastkExtremes.min,
            visibleMax: fastkExtremes.max,
        },
        macd: {
            timestamp,
            series: bundle.macd.series,
            params: bundle.macd.params,
            valueMin: macdValueMin,
            valueMax: macdValueMax,
            visibleMin: macdExtremes.min,
            visibleMax: macdExtremes.max,
            latestValues: latestPoint ? {
                dif: latestPoint.dif,
                dea: latestPoint.dea,
                macd: latestPoint.macd,
            } : undefined,
        },
    }
}

/**
 * 从 series bundle 组装所有 render states
 * 同时计算 visibleMin/visibleMax 等派生字段
 */
export function composeRenderStates(
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    timestamp: number
): ComposedRenderStates {
    const maExtremes = calcMAExtremes(bundle.ma.series, visibleRange)
    const bollExtremes = calcBOLLExtremes(bundle.boll.series, visibleRange)
    const expmaExtremes = calcEXPMAExtremes(bundle.expma.series, visibleRange)
    const eneExtremes = calcENEExtremes(bundle.ene.series, visibleRange)
    const subStates = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp)

    return {
        ma: {
            timestamp,
            series: bundle.ma.series,
            enabledPeriods: bundle.ma.enabledPeriods,
            visibleMin: maExtremes.min,
            visibleMax: maExtremes.max,
        },
        boll: {
            timestamp,
            series: bundle.boll.series,
            params: bundle.boll.params,
            visibleMin: bollExtremes.min,
            visibleMax: bollExtremes.max,
        },
        expma: {
            timestamp,
            series: bundle.expma.series,
            params: bundle.expma.params,
            visibleMin: expmaExtremes.min,
            visibleMax: expmaExtremes.max,
        },
        ene: {
            timestamp,
            series: bundle.ene.series,
            params: bundle.ene.params,
            visibleMin: eneExtremes.min,
            visibleMax: eneExtremes.max,
        },
        ...subStates,
    }
}

// ============================================================================
// 极值计算辅助函数
// ============================================================================

function calcMAExtremes(series: Record<number, (number | undefined)[]>, range: VisibleRange): { min: number; max: number } {
    const seriesList = Object.values(series)
    if (seriesList.length === 0 || range.start >= seriesList[0]!.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    for (const values of seriesList) {
        const end = Math.min(range.end, values.length)
        for (let i = range.start; i < end; i++) {
            const v = values[i]
            if (v !== undefined) {
                min = Math.min(min, v)
                max = Math.max(max, v)
            }
        }
    }
    return { min, max }
}

interface BOLLPoint { upper: number; middle: number; lower: number }
function calcBOLLExtremes(series: BOLLPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.upper, p.middle, p.lower)
            max = Math.max(max, p.upper, p.middle, p.lower)
        }
    }
    return { min, max }
}

interface EXPMAPoint { fast: number; slow: number }
function calcEXPMAExtremes(series: EXPMAPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.fast, p.slow)
            max = Math.max(max, p.fast, p.slow)
        }
    }
    return { min, max }
}

interface ENEPoint { upper: number; middle: number; lower: number }
function calcENEExtremes(series: ENEPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.upper, p.middle, p.lower)
            max = Math.max(max, p.upper, p.middle, p.lower)
        }
    }
    return { min, max }
}

function calcRSIExtremes(series: Record<number, (number | undefined)[]>, range: VisibleRange): { min: number; max: number } {
    const seriesList = Object.values(series)
    if (seriesList.length === 0 || range.start >= seriesList[0]!.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    for (const values of seriesList) {
        const end = Math.min(range.end, values.length)
        for (let i = range.start; i < end; i++) {
            const v = values[i]
            if (v !== undefined) {
                min = Math.min(min, v)
                max = Math.max(max, v)
            }
        }
    }
    return { min, max }
}

function calcCCIExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

interface STOCHPoint { k: number; d: number }
function calcSTOCHExtremes(series: STOCHPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.k, p.d)
            max = Math.max(max, p.k, p.d)
        }
    }
    return { min, max }
}

function calcMOMExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

function calcWMSRExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

interface KSTPoint { kst: number; signal: number }
function calcKSTExtremes(series: KSTPoint[], range: VisibleRange): { min: number; max: number } {
    // 快速检查：空数据直接返回
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.kst, p.signal)
            max = Math.max(max, p.kst, p.signal)
        }
    }
    return { min, max }
}

function calcFASTKExtremes(series: (number | undefined)[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const v = series[i]
        if (v !== undefined) {
            min = Math.min(min, v)
            max = Math.max(max, v)
        }
    }
    return { min, max }
}

interface MACDPoint { dif: number; dea: number; macd: number }
function calcMACDExtremes(series: MACDPoint[], range: VisibleRange): { min: number; max: number } {
    if (series.length === 0 || range.start >= series.length) {
        return { min: Infinity, max: -Infinity }
    }
    let min = Infinity
    let max = -Infinity
    const end = Math.min(range.end, series.length)
    for (let i = range.start; i < end; i++) {
        const p = series[i]
        if (p) {
            min = Math.min(min, p.dif, p.dea, p.macd)
            max = Math.max(max, p.dif, p.dea, p.macd)
        }
    }
    return { min, max }
}

/**
 * 计算主图指标价格范围
 * 用于 Chart.draw() 中的 pane.updateRange
 */
export function computeMainIndicatorPriceRange(
    bundle: IndicatorSeriesBundle,
    visibleRange: VisibleRange,
    activeMainIndicators: Set<string>
): { min: number; max: number } | null {
    let min = Infinity
    let max = -Infinity
    const { start, end } = visibleRange

    // MA
    if (activeMainIndicators.has('ma') && Object.keys(bundle.ma.series).length > 0) {
        for (const values of Object.values(bundle.ma.series)) {
            for (let i = start; i < end && i < values.length; i++) {
                const v = values[i]
                if (v !== undefined) {
                    min = Math.min(min, v)
                    max = Math.max(max, v)
                }
            }
        }
    }

    // BOLL
    if (activeMainIndicators.has('boll') && bundle.boll.series.length > 0) {
        for (let i = start; i < end && i < bundle.boll.series.length; i++) {
            const p = bundle.boll.series[i]
            if (p) {
                min = Math.min(min, p.upper, p.middle, p.lower)
                max = Math.max(max, p.upper, p.middle, p.lower)
            }
        }
    }

    // EXPMA
    if (activeMainIndicators.has('expma') && bundle.expma.series.length > 0) {
        for (let i = start; i < end && i < bundle.expma.series.length; i++) {
            const p = bundle.expma.series[i]
            if (p) {
                min = Math.min(min, p.fast, p.slow)
                max = Math.max(max, p.fast, p.slow)
            }
        }
    }

    // ENE
    if (activeMainIndicators.has('ene') && bundle.ene.series.length > 0) {
        for (let i = start; i < end && i < bundle.ene.series.length; i++) {
            const p = bundle.ene.series[i]
            if (p) {
                min = Math.min(min, p.upper, p.middle, p.lower)
                max = Math.max(max, p.upper, p.middle, p.lower)
            }
        }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return null
    }

    return { min, max }
}
