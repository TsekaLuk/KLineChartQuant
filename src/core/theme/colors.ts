/**
 * 主题感知颜色配置
 * 所有颜色通过 getColors(theme) 获取，支持 light/dark 双主题
 */

/** 主题类型 */
export type ChartTheme = 'light' | 'dark'

/** 文本颜色 */
export interface TextColors {
    PRIMARY: string
    SECONDARY: string
    TERTIARY: string
    WEAK: string
    WHITE: string
}

/** 涨跌价格颜色 */
export interface PriceColors {
    UP: string
    UP_LIGHT: string
    UP_TICK: string
    DOWN: string
    DOWN_LIGHT: string
    DOWN_TICK: string
    NEUTRAL: string
    LAST_PRICE: string
}

/** 标签背景颜色 */
export interface TagBgColors {
    WHITE: string
    LIGHT_GRAY: string
    PURE_WHITE: string
    TRANSPARENT: string
    ACTIVE: string
    ACTIVE_HOVER: string
    HOVER: string
}

/** 边框颜色 */
export interface BorderColors {
    DARK: string
    MEDIUM: string
    LIGHT: string
    SEPARATOR: string
    BUTTON: string
}

/** 网格线颜色 */
export interface GridColors {
    HORIZONTAL: string
    VERTICAL: string
}

/** 十字线颜色 */
export interface CrosshairColors {
    LINE: string
    LABEL_BG: string
    LABEL_TEXT: string
}

/** 均线颜色 */
export interface MAColors {
    MA5: string
    MA10: string
    MA20: string
    MA30: string
    MA60: string
}

/** 布林带颜色 */
export interface BOLLColors {
    UPPER: string
    MIDDLE: string
    LOWER: string
    BAND_FILL: string
}

/** MACD 颜色 */
export interface MACDColors {
    DIF: string
    DEA: string
    BAR_UP: string
    BAR_UP_LIGHT: string
    BAR_DOWN: string
    BAR_DOWN_LIGHT: string
}

/** 成交量颜色 */
export interface VolumeColors {
    UP: string
    DOWN: string
    NEUTRAL: string
}

/** RSI 颜色 */
export interface RSIColors {
    RSI1: string
    RSI2: string
    RSI3: string
}

/** CCI 颜色 */
export interface CCIColors {
    CCI: string
    OVERBOUGHT: string
    OVERSOLD: string
}

/** KDJ/STOCH 颜色 */
export interface KDJColors {
    K: string
    D: string
    J: string
}

/** MOM 颜色 */
export interface MOMColors {
    MOM: string
    ZERO: string
}

/** WMSR 颜色 */
export interface WMSRColors {
    WMSR: string
    OVERBOUGHT: string
    OVERSOLD: string
}

/** KST 颜色 */
export interface KSTColors {
    KST: string
    SIGNAL: string
}

/** EXPMA 颜色 */
export interface EXPMAColors {
    FAST: string
    SLOW: string
}

/** ENE 颜色 */
export interface ENEColors {
    UPPER: string
    MIDDLE: string
    LOWER: string
    BAND_FILL: string
}

/** 标签专用颜色（收敛硬编码） */
export interface LabelColors {
    BG: string
    TEXT: string
}

/** 最新价标签颜色 */
export interface LastPriceLabelColors {
    BG: string
}

/** 成交量价格标记颜色 */
export interface VolumePriceColors {
    RISE_WITH: string
    RISE_WITHOUT: string
    FALL_WITH: string
    FALL_WITHOUT: string
}

/** Structure 指标颜色 */
export interface StructureColors {
    HH: string
    HL: string
    LH: string
    LL: string
    CHOCH: string
    BOS: string
}

/** Zones 指标颜色 */
export interface ZonesColors {
    FVG_BULL_FILL: string
    FVG_BEAR_FILL: string
    FVG_BULL_BORDER: string
    FVG_BEAR_BORDER: string
    OB_BULL_FILL: string
    OB_BEAR_FILL: string
}

/** 主题色值集合 */
export interface ThemeColors {
    TEXT: TextColors
    PRICE: PriceColors
    TAG_BG: TagBgColors
    BORDER: BorderColors
    GRID: GridColors
    CROSSHAIR: CrosshairColors
    MA: MAColors
    BOLL: BOLLColors
    MACD: MACDColors
    VOLUME: VolumeColors
    RSI: RSIColors
    CCI: CCIColors
    KDJ: KDJColors
    MOM: MOMColors
    WMSR: WMSRColors
    KST: KSTColors
    EXPMA: EXPMAColors
    ENE: ENEColors
    /** 收敛的硬编码色值 */
    LABEL: LabelColors
    LAST_PRICE_LABEL: LastPriceLabelColors
    VOLUME_PRICE: VolumePriceColors
    STRUCTURE: StructureColors
    ZONES: ZonesColors
    WMSR_GRID: string
}

// ==================== Light Theme ====================

const lightTextColors: TextColors = {
    PRIMARY: 'hsl(210, 9%, 31%)',
    SECONDARY: 'hsl(210, 9%, 35%)',
    TERTIARY: 'hsl(210, 8%, 50%)',
    WEAK: 'hsl(210, 7%, 65%)',
    WHITE: 'rgba(255, 255, 255, 0.92)',
}

const lightPriceColors: PriceColors = {
    UP: 'rgba(214, 10, 34, 1)',
    UP_LIGHT: 'rgba(214, 10, 34, 0.92)',
    UP_TICK: 'hsl(0, 60%, 50%)',
    DOWN: 'rgba(3, 123, 102, 1)',
    DOWN_LIGHT: 'rgba(3, 123, 102, 0.92)',
    DOWN_TICK: 'hsl(150, 30%, 60%)',
    NEUTRAL: 'rgba(0, 0, 0, 0.78)',
    LAST_PRICE: 'rgba(196, 74, 86, 0.95)',
}

const lightTagBgColors: TagBgColors = {
    WHITE: 'rgb(255, 255, 255)',
    LIGHT_GRAY: 'rgba(255, 255, 255, 0.92)',
    PURE_WHITE: '#ffffff',
    TRANSPARENT: 'transparent',
    ACTIVE: '#1890ff',
    ACTIVE_HOVER: '#40a9ff',
    HOVER: '#f0f0f0',
}

const lightBorderColors: BorderColors = {
    DARK: 'rgba(0, 0, 0, 0.12)',
    MEDIUM: 'rgba(0, 0, 0, 0.10)',
    LIGHT: 'rgba(0, 0, 0, 0.08)',
    SEPARATOR: 'rgba(0, 0, 0, 0.10)',
    BUTTON: '#d0d0d0',
}

const lightGridColors: GridColors = {
    HORIZONTAL: 'rgba(0, 0, 0, 0.06)',
    VERTICAL: 'rgba(0, 0, 0, 0.12)',
}

const lightCrosshairColors: CrosshairColors = {
    LINE: 'rgba(0, 0, 0, 0.28)',
    LABEL_BG: 'rgb(0, 0, 0)',
    LABEL_TEXT: 'rgba(255, 255, 255, 0.92)',
}

const lightMAColors: MAColors = {
    MA5: 'rgba(255, 193, 37, 1)',
    MA10: 'rgba(190, 131, 12, 1)',
    MA20: 'rgba(69, 112, 249, 1)',
    MA30: 'rgba(76, 175, 80, 1)',
    MA60: 'rgba(156, 39, 176, 1)',
}

const lightBOLLColors: BOLLColors = {
    UPPER: 'rgba(178, 34, 34, 1)',
    MIDDLE: 'rgba(69, 112, 249, 1)',
    LOWER: 'rgba(34, 139, 34, 1)',
    BAND_FILL: 'rgba(100, 149, 237, 0.1)',
}

const lightMACDColors: MACDColors = {
    DIF: 'rgba(69, 112, 249, 1)',
    DEA: 'rgba(255, 152, 0, 1)',
    BAR_UP: '#ff5252',
    BAR_UP_LIGHT: '#fccbcd',
    BAR_DOWN: '#22ab94',
    BAR_DOWN_LIGHT: '#ace5dc',
}

const lightVolumeColors: VolumeColors = {
    UP: '#ff5252',
    DOWN: '#22ab94',
    NEUTRAL: 'rgba(0, 0, 0, 0.78)',
}

const lightRSIColors: RSIColors = {
    RSI1: 'rgba(69, 112, 249, 1)',
    RSI2: 'rgba(255, 152, 0, 1)',
    RSI3: 'rgba(156, 39, 176, 1)',
}

const lightCCIColors: CCIColors = {
    CCI: 'rgba(69, 112, 249, 1)',
    OVERBOUGHT: 'rgba(214, 10, 34, 0.5)',
    OVERSOLD: 'rgba(3, 123, 102, 0.5)',
}

const lightKDJColors: KDJColors = {
    K: 'rgba(69, 112, 249, 1)',
    D: 'rgba(255, 152, 0, 1)',
    J: 'rgba(156, 39, 176, 1)',
}

const lightMOMColors: MOMColors = {
    MOM: 'rgba(69, 112, 249, 1)',
    ZERO: 'rgba(0, 0, 0, 0.2)',
}

const lightWMSRColors: WMSRColors = {
    WMSR: 'rgba(69, 112, 249, 1)',
    OVERBOUGHT: 'rgba(214, 10, 34, 0.5)',
    OVERSOLD: 'rgba(3, 123, 102, 0.5)',
}

const lightKSTColors: KSTColors = {
    KST: 'rgba(69, 112, 249, 1)',
    SIGNAL: 'rgba(255, 152, 0, 1)',
}

const lightEXPMAColors: EXPMAColors = {
    FAST: 'rgba(255, 152, 0, 1)',
    SLOW: 'rgba(69, 112, 249, 1)',
}

const lightENEColors: ENEColors = {
    UPPER: 'rgba(214, 10, 34, 1)',
    MIDDLE: 'rgba(69, 112, 249, 1)',
    LOWER: 'rgba(3, 123, 102, 1)',
    BAND_FILL: 'rgba(69, 112, 249, 0.08)',
}

const lightLabelColors: LabelColors = {
    BG: 'rgba(0, 0, 0, 0.8)',
    TEXT: '#ffffff',
}

const lightLastPriceLabelColors: LastPriceLabelColors = {
    BG: 'rgba(255, 247, 248, 0.98)',
}

const lightVolumePriceColors: VolumePriceColors = {
    RISE_WITH: '#FF4444',
    RISE_WITHOUT: '#00C853',
    FALL_WITH: '#FF4444',
    FALL_WITHOUT: '#00C853',
}

const lightStructureColors: StructureColors = {
    HH: '#16a34a',
    HL: '#22c55e',
    LH: '#dc2626',
    LL: '#ef4444',
    CHOCH: '#8b5cf6',
    BOS: '#f59e0b',
}

const lightZonesColors: ZonesColors = {
    FVG_BULL_FILL: 'rgba(34, 197, 94, 0.15)',
    FVG_BEAR_FILL: 'rgba(239, 68, 68, 0.15)',
    FVG_BULL_BORDER: 'rgba(34, 197, 94, 0.6)',
    FVG_BEAR_BORDER: 'rgba(239, 68, 68, 0.6)',
    OB_BULL_FILL: 'rgba(34, 197, 94, 0.25)',
    OB_BEAR_FILL: 'rgba(239, 68, 68, 0.25)',
}

// ==================== Dark Theme ====================

const darkTextColors: TextColors = {
    PRIMARY: 'hsl(210, 10%, 85%)',
    SECONDARY: 'hsl(210, 8%, 75%)',
    TERTIARY: 'hsl(210, 6%, 60%)',
    WEAK: 'hsl(210, 5%, 45%)',
    WHITE: 'rgba(255, 255, 255, 0.95)',
}

const darkPriceColors: PriceColors = {
    UP: 'rgba(255, 80, 100, 1)',
    UP_LIGHT: 'rgba(255, 80, 100, 0.85)',
    UP_TICK: 'hsl(0, 70%, 60%)',
    DOWN: 'rgba(60, 200, 160, 1)',
    DOWN_LIGHT: 'rgba(60, 200, 160, 0.85)',
    DOWN_TICK: 'hsl(150, 50%, 65%)',
    NEUTRAL: 'rgba(255, 255, 255, 0.7)',
    LAST_PRICE: 'rgba(230, 100, 115, 0.95)',
}

const darkTagBgColors: TagBgColors = {
    WHITE: 'rgb(40, 40, 55)',
    LIGHT_GRAY: 'rgba(50, 50, 65, 0.92)',
    PURE_WHITE: '#282837',
    TRANSPARENT: 'transparent',
    ACTIVE: '#1890ff',
    ACTIVE_HOVER: '#40a9ff',
    HOVER: '#3a3a4a',
}

const darkBorderColors: BorderColors = {
    DARK: 'rgba(255, 255, 255, 0.15)',
    MEDIUM: 'rgba(255, 255, 255, 0.12)',
    LIGHT: 'rgba(255, 255, 255, 0.08)',
    SEPARATOR: 'rgba(255, 255, 255, 0.10)',
    BUTTON: '#505060',
}

const darkGridColors: GridColors = {
    HORIZONTAL: 'rgba(255, 255, 255, 0.06)',
    VERTICAL: 'rgba(255, 255, 255, 0.10)',
}

const darkCrosshairColors: CrosshairColors = {
    LINE: 'rgba(255, 255, 255, 0.4)',
    LABEL_BG: 'rgb(40, 40, 55)',
    LABEL_TEXT: 'rgba(255, 255, 255, 0.92)',
}

const darkMAColors: MAColors = {
    MA5: 'rgba(255, 200, 50, 1)',
    MA10: 'rgba(200, 150, 30, 1)',
    MA20: 'rgba(90, 140, 255, 1)',
    MA30: 'rgba(90, 190, 95, 1)',
    MA60: 'rgba(170, 60, 195, 1)',
}

const darkBOLLColors: BOLLColors = {
    UPPER: 'rgba(200, 60, 60, 1)',
    MIDDLE: 'rgba(90, 140, 255, 1)',
    LOWER: 'rgba(50, 170, 60, 1)',
    BAND_FILL: 'rgba(120, 170, 255, 0.15)',
}

const darkMACDColors: MACDColors = {
    DIF: 'rgba(90, 140, 255, 1)',
    DEA: 'rgba(255, 170, 50, 1)',
    BAR_UP: '#ff6b6b',
    BAR_UP_LIGHT: '#ffb3b3',
    BAR_DOWN: '#4ecdc4',
    BAR_DOWN_LIGHT: '#a8e6e1',
}

const darkVolumeColors: VolumeColors = {
    UP: '#ff6b6b',
    DOWN: '#4ecdc4',
    NEUTRAL: 'rgba(255, 255, 255, 0.6)',
}

const darkRSIColors: RSIColors = {
    RSI1: 'rgba(90, 140, 255, 1)',
    RSI2: 'rgba(255, 170, 50, 1)',
    RSI3: 'rgba(180, 70, 205, 1)',
}

const darkCCIColors: CCIColors = {
    CCI: 'rgba(90, 140, 255, 1)',
    OVERBOUGHT: 'rgba(255, 80, 100, 0.6)',
    OVERSOLD: 'rgba(60, 200, 160, 0.6)',
}

const darkKDJColors: KDJColors = {
    K: 'rgba(90, 140, 255, 1)',
    D: 'rgba(255, 170, 50, 1)',
    J: 'rgba(180, 70, 205, 1)',
}

const darkMOMColors: MOMColors = {
    MOM: 'rgba(90, 140, 255, 1)',
    ZERO: 'rgba(255, 255, 255, 0.2)',
}

const darkWMSRColors: WMSRColors = {
    WMSR: 'rgba(90, 140, 255, 1)',
    OVERBOUGHT: 'rgba(255, 80, 100, 0.6)',
    OVERSOLD: 'rgba(60, 200, 160, 0.6)',
}

const darkKSTColors: KSTColors = {
    KST: 'rgba(90, 140, 255, 1)',
    SIGNAL: 'rgba(255, 170, 50, 1)',
}

const darkEXPMAColors: EXPMAColors = {
    FAST: 'rgba(255, 170, 50, 1)',
    SLOW: 'rgba(90, 140, 255, 1)',
}

const darkENEColors: ENEColors = {
    UPPER: 'rgba(255, 80, 100, 1)',
    MIDDLE: 'rgba(90, 140, 255, 1)',
    LOWER: 'rgba(60, 200, 160, 1)',
    BAND_FILL: 'rgba(90, 140, 255, 0.12)',
}

const darkLabelColors: LabelColors = {
    BG: 'rgba(30, 30, 40, 0.9)',
    TEXT: '#ffffff',
}

const darkLastPriceLabelColors: LastPriceLabelColors = {
    BG: 'rgba(60, 50, 55, 0.98)',
}

const darkVolumePriceColors: VolumePriceColors = {
    RISE_WITH: '#FF6666',
    RISE_WITHOUT: '#66FF99',
    FALL_WITH: '#FF6666',
    FALL_WITHOUT: '#66FF99',
}

const darkStructureColors: StructureColors = {
    HH: '#4ade80',
    HL: '#22c55e',
    LH: '#f87171',
    LL: '#ef4444',
    CHOCH: '#a78bfa',
    BOS: '#fbbf24',
}

const darkZonesColors: ZonesColors = {
    FVG_BULL_FILL: 'rgba(74, 222, 128, 0.20)',
    FVG_BEAR_FILL: 'rgba(248, 113, 113, 0.20)',
    FVG_BULL_BORDER: 'rgba(74, 222, 128, 0.8)',
    FVG_BEAR_BORDER: 'rgba(248, 113, 113, 0.8)',
    OB_BULL_FILL: 'rgba(74, 222, 128, 0.35)',
    OB_BEAR_FILL: 'rgba(248, 113, 113, 0.35)',
}

// ==================== Theme Collections ====================

const lightTheme: ThemeColors = {
    TEXT: lightTextColors,
    PRICE: lightPriceColors,
    TAG_BG: lightTagBgColors,
    BORDER: lightBorderColors,
    GRID: lightGridColors,
    CROSSHAIR: lightCrosshairColors,
    MA: lightMAColors,
    BOLL: lightBOLLColors,
    MACD: lightMACDColors,
    VOLUME: lightVolumeColors,
    RSI: lightRSIColors,
    CCI: lightCCIColors,
    KDJ: lightKDJColors,
    MOM: lightMOMColors,
    WMSR: lightWMSRColors,
    KST: lightKSTColors,
    EXPMA: lightEXPMAColors,
    ENE: lightENEColors,
    LABEL: lightLabelColors,
    LAST_PRICE_LABEL: lightLastPriceLabelColors,
    VOLUME_PRICE: lightVolumePriceColors,
    STRUCTURE: lightStructureColors,
    ZONES: lightZonesColors,
    WMSR_GRID: 'rgba(0, 0, 0, 0.1)',
}

const darkTheme: ThemeColors = {
    TEXT: darkTextColors,
    PRICE: darkPriceColors,
    TAG_BG: darkTagBgColors,
    BORDER: darkBorderColors,
    GRID: darkGridColors,
    CROSSHAIR: darkCrosshairColors,
    MA: darkMAColors,
    BOLL: darkBOLLColors,
    MACD: darkMACDColors,
    VOLUME: darkVolumeColors,
    RSI: darkRSIColors,
    CCI: darkCCIColors,
    KDJ: darkKDJColors,
    MOM: darkMOMColors,
    WMSR: darkWMSRColors,
    KST: darkKSTColors,
    EXPMA: darkEXPMAColors,
    ENE: darkENEColors,
    LABEL: darkLabelColors,
    LAST_PRICE_LABEL: darkLastPriceLabelColors,
    VOLUME_PRICE: darkVolumePriceColors,
    STRUCTURE: darkStructureColors,
    ZONES: darkZonesColors,
    WMSR_GRID: 'rgba(255, 255, 255, 0.1)',
}

/**
 * 根据主题获取颜色配置
 * @param theme - 主题类型 'light' | 'dark'
 * @returns 主题色值集合
 */
export function getColors(theme: ChartTheme): ThemeColors {
    return theme === 'dark' ? darkTheme : lightTheme
}

/**
 * 日志颜色（与主题无关，保留常量导出）
 */
export const LOG_COLORS = {
    INFO: 'background:#164586;color:#fff;',
    SUCCESS: 'background:#389e0d;color:#fff;',
    WARN: 'background:#d46b08;color:#fff;',
    ERROR: 'background:#cf1322;color:#fff;',
    CONSOLE: '#666',
} as const

/**
 * 工具函数：根据涨跌返回颜色
 * @param type - 涨跌类型
 * @param theme - 主题类型
 * @returns 对应颜色
 */
export function getPriceColor(type: 'up' | 'down' | 'neutral', theme: ChartTheme = 'light'): string {
    const colors = getColors(theme)
    switch (type) {
        case 'up':
            return colors.PRICE.UP
        case 'down':
            return colors.PRICE.DOWN
        case 'neutral':
            return colors.PRICE.NEUTRAL
    }
}

/**
 * 工具函数：根据涨跌百分比返回颜色
 * @param changePercent - 涨跌百分比
 * @param theme - 主题类型
 * @returns 对应颜色
 */
export function getTickColor(changePercent: number, theme: ChartTheme = 'light'): string {
    const colors = getColors(theme)
    return changePercent >= 0 ? colors.PRICE.UP_TICK : colors.PRICE.DOWN_TICK
}
