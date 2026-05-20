import type { BaseIndicatorState } from '@/plugin'
import { createIndicatorStateKey } from '@/plugin/stateKeys'

export interface FASTKRenderState extends BaseIndicatorState {
    timestamp: number
    series: (number | undefined)[]
    params: { period: number; showFASTK: boolean }
    valueMin: number
    valueMax: number
    visibleMin: number
    visibleMax: number
}

export const createFASTKStateKey = (paneId: string) =>
    createIndicatorStateKey('fastk', paneId) as const

export const EMPTY_FASTK_STATE: FASTKRenderState = {
    timestamp: 0,
    series: [],
    params: { period: 9, showFASTK: true },
    valueMin: 0,
    valueMax: 100,
    visibleMin: Infinity,
    visibleMax: -Infinity,
}
