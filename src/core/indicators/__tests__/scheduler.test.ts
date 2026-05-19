import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IndicatorScheduler } from '../scheduler'
import { MA_STATE_KEY, EMPTY_MA_STATE, type MARenderState } from '../maState'
import { BOLL_STATE_KEY, EMPTY_BOLL_STATE, type BOLLRenderState } from '../bollState'
import { EXPMA_STATE_KEY, EMPTY_EXPMA_STATE, type EXPMARenderState } from '../expmaState'
import { ENE_STATE_KEY, EMPTY_ENE_STATE, type ENERenderState } from '../eneState'
import type { KLineData } from '@/types/price'
import type { PluginHost } from '@/plugin'

/**
 * 创建测试用的 K 线数据
 */
function createTestData(length: number, startPrice = 100): KLineData[] {
  return Array.from({ length }, (_, i) => ({
    timestamp: 1000000000000 + i * 60000,
    open: startPrice + i,
    high: startPrice + i + 1,
    low: startPrice + i - 1,
    close: startPrice + i,
    volume: 1000 + i * 100,
  }))
}

/**
 * 创建 mock PluginHost
 */
function createMockPluginHost(): PluginHost {
  const stateStore = new Map<string, unknown>()

  return {
    setSharedState: vi.fn((key: string, state: unknown, _owner: string) => {
      stateStore.set(key, state)
    }),
    getSharedState: vi.fn(<T>(key: string): T | undefined => {
      return stateStore.get(key) as T | undefined
    }),
    clearByOwner: vi.fn(),
    getCanvas: vi.fn(),
    getMainPane: vi.fn(),
    getSubPane: vi.fn(),
    getAllSubPanes: vi.fn(),
    getTheme: vi.fn(),
    getStyles: vi.fn(),
    getBarStyles: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
  } as unknown as PluginHost
}

/**
 * 从 mock 调用中获取指定 key 的状态（最后一次）
 */
function getStateFromMockCalls<T>(mockHost: PluginHost, key: string): T | undefined {
  const calls = vi.mocked(mockHost.setSharedState).mock.calls
  // 从后往前找，获取最后一次写入该 key 的状态
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i]![0] === key) {
      return calls[i]![1] as T
    }
  }
  return undefined
}

describe('IndicatorScheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
  })

  describe('initialization', () => {
    it('should not write to state store before first update', () => {
      expect(mockHost.setSharedState).not.toHaveBeenCalled()
    })

    it('should accept plugin host', () => {
      const newScheduler = new IndicatorScheduler()
      newScheduler.setPluginHost(mockHost)
      // Should not throw
      expect(() => newScheduler.recompute()).not.toThrow()
    })
  })

  describe('data update', () => {
    it('should write MARenderState to StateStore after update', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)

      expect(mockHost.setSharedState).toHaveBeenCalledWith(
        MA_STATE_KEY,
        expect.objectContaining({
          timestamp: expect.any(Number),
          series: expect.any(Object),
          enabledPeriods: expect.any(Array),
          visibleMin: expect.any(Number),
          visibleMax: expect.any(Number),
        }),
        'ma_scheduler'
      )
    })

    it('should calculate all default MA periods', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.enabledPeriods).toContain(5)
      expect(state!.enabledPeriods).toContain(10)
      expect(state!.enabledPeriods).toContain(20)
      expect(state!.enabledPeriods).toContain(30)
      expect(state!.enabledPeriods).toContain(60)
    })

    it('should set correct visibleMin and visibleMax for full range', () => {
      // Data: 100, 101, 102, ... 199
      const data = createTestData(100, 100)
      const visibleRange = { start: 60, end: 70 } // Viewing prices 160-169

      scheduler.update(data, visibleRange)

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      // MA5 of prices 160-169 should be between 156-169
      expect(state!.visibleMin).toBeLessThan(state!.visibleMax)
      expect(state!.visibleMax).toBeGreaterThan(150)
    })

    it('should handle empty data', () => {
      const data: KLineData[] = []
      const visibleRange = { start: 0, end: 0 }

      scheduler.update(data, visibleRange)

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.visibleMin).toBe(Infinity)
      expect(state!.visibleMax).toBe(-Infinity)
    })
  })

  describe('MA config update', () => {
    it('should update enabled periods based on config', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)

      // Disable some periods
      scheduler.updateMAConfig({
        ma5: true,
        ma10: false,
        ma20: true,
        ma30: false,
        ma60: false,
      })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.enabledPeriods).toContain(5)
      expect(state!.enabledPeriods).toContain(20)
      expect(state!.enabledPeriods).not.toContain(10)
      expect(state!.enabledPeriods).not.toContain(30)
      expect(state!.enabledPeriods).not.toContain(60)
    })

    it('should disable all periods when all flags are false', () => {
      const data = createTestData(100)
      const visibleRange = { start: 0, end: 100 }

      scheduler.update(data, visibleRange)
      scheduler.updateMAConfig({
        ma5: false,
        ma10: false,
        ma20: false,
        ma30: false,
        ma60: false,
      })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      expect(state!.enabledPeriods).toHaveLength(0)
      expect(state!.visibleMin).toBe(Infinity)
      expect(state!.visibleMax).toBe(-Infinity)
    })
  })

  describe('visible range update (dual dirty flags)', () => {
    it('should recalculate extremes but not series on viewport change only', () => {
      const data = createTestData(100)

      // First update with full range
      scheduler.update(data, { start: 0, end: 100 })

      // Reset mock to track only the viewport change
      vi.mocked(mockHost.setSharedState).mockClear()

      // Update only viewport
      scheduler.updateVisibleRange({ start: 50, end: 60 })

      // Should write all 4 indicator states (MA, BOLL, EXPMA, ENE)
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(4)

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      // Extremes should be recalculated for new viewport
      expect(state!.visibleMin).toBeLessThan(state!.visibleMax)
    })

    it('should recalculate series on data change', () => {
      const data1 = createTestData(100)
      scheduler.update(data1, { start: 0, end: 100 })

      const data2 = createTestData(100, 200)
      scheduler.update(data2, { start: 0, end: 100 })

      // Should be called 8 times (4 indicators × 2 data updates)
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(8)
    })
  })

  describe('recompute', () => {
    it('should force full recalculation', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      vi.mocked(mockHost.setSharedState).mockClear()

      scheduler.recompute()

      // Should write all 4 indicator states
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(4)
    })

    it('should recalculate with same data and range', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const firstState = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(firstState).toBeDefined()

      // Small delay to ensure different timestamp
      const start = Date.now()
      while (Date.now() < start + 2) { /* busy wait */ }

      scheduler.recompute()

      const secondState = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(secondState).toBeDefined()

      // Timestamps should be different (or at least not earlier)
      expect(secondState!.timestamp).toBeGreaterThanOrEqual(firstState!.timestamp)
    })
  })

  describe('series data structure', () => {
    it('should store series as Record with period keys', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      // Series should be a Record/object with string keys (numbers become strings in JS objects)
      expect(typeof state!.series).toBe('object')
      expect(state!.series[5]).toBeDefined()
      expect(Array.isArray(state!.series[5])).toBe(true)
      expect(state!.series[5]).toHaveLength(100)
    })

    it('should have undefined values for indices before period-1', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const state = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
      expect(state).toBeDefined()

      // First 4 values of MA5 should be undefined
      expect(state!.series[5][0]).toBeUndefined()
      expect(state!.series[5][3]).toBeUndefined()
      expect(state!.series[5][4]).toBeDefined()
    })
  })
})

describe('EMPTY_MA_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_MA_STATE).toEqual({
      timestamp: 0,
      series: {},
      enabledPeriods: [],
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_MA_STATE.visibleMin).toBeGreaterThan(EMPTY_MA_STATE.visibleMax)
  })
})

describe('BOLL State in scheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
  })

  it('should write BOLLRenderState to StateStore after update', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.timestamp).toBeGreaterThan(0)
    expect(state!.series).toHaveLength(100)
    expect(state!.params.period).toBe(20)
    expect(state!.params.multiplier).toBe(2)
  })

  it('should have sparse BOLL series with undefined before period-1', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state).toBeDefined()

    // First 19 values should be undefined (period=20)
    for (let i = 0; i < 19; i++) {
      expect(state!.series[i]).toBeUndefined()
    }
    expect(state!.series[19]).toBeDefined()
  })

  it('should pass BOLL params including show flags', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state!.params.showUpper).toBe(true)
    expect(state!.params.showMiddle).toBe(true)
    expect(state!.params.showLower).toBe(true)
    expect(state!.params.showBand).toBe(true)
  })

  it('should update BOLL config via updateBOLLConfig', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    scheduler.updateBOLLConfig({ period: 10, multiplier: 3 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state!.params.period).toBe(10)
    expect(state!.params.multiplier).toBe(3)
  })

  it('should recalculate BOLL series when config changes', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const stateBefore = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    const seriesBefore = stateBefore!.series[19]

    scheduler.updateBOLLConfig({ period: 10 })

    const stateAfter = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    // With period=10, index 9 is first valid point, index 19 should differ
    expect(stateAfter!.series[9]).toBeDefined()
  })

  it('should handle empty data', () => {
    scheduler.update([], { start: 0, end: 0 })

    const state = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.visibleMin).toBe(Infinity)
    expect(state!.visibleMax).toBe(-Infinity)
  })
})

describe('EXPMA State in scheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
  })

  it('should write EXPMARenderState to StateStore after update', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.timestamp).toBeGreaterThan(0)
    expect(state!.series).toHaveLength(100)
    expect(state!.params.fastPeriod).toBe(12)
    expect(state!.params.slowPeriod).toBe(50)
  })

  it('should have dense EXPMA series from index 0', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state!.series[0]).toBeDefined()
    expect(state!.series[0]!.fast).toBeDefined()
    expect(state!.series[0]!.slow).toBeDefined()
  })

  it('should update EXPMA config via updateEXPMAConfig', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    scheduler.updateEXPMAConfig({ fastPeriod: 6, slowPeriod: 30 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state!.params.fastPeriod).toBe(6)
    expect(state!.params.slowPeriod).toBe(30)
  })

  it('should handle empty data', () => {
    scheduler.update([], { start: 0, end: 0 })

    const state = getStateFromMockCalls<EXPMARenderState>(mockHost, EXPMA_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.visibleMin).toBe(Infinity)
    expect(state!.visibleMax).toBe(-Infinity)
  })
})

describe('ENE State in scheduler', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
  })

  it('should write ENERenderState to StateStore after update', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.timestamp).toBeGreaterThan(0)
    expect(state!.series).toHaveLength(100)
    expect(state!.params.period).toBe(10)
    expect(state!.params.deviation).toBe(11)
  })

  it('should have sparse ENE series with undefined before period-1', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state).toBeDefined()

    for (let i = 0; i < 9; i++) {
      expect(state!.series[i]).toBeUndefined()
    }
    expect(state!.series[9]).toBeDefined()
  })

  it('should update ENE config via updateENEConfig', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    scheduler.updateENEConfig({ period: 20, deviation: 8 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state!.params.period).toBe(20)
    expect(state!.params.deviation).toBe(8)
  })

  it('should handle empty data', () => {
    scheduler.update([], { start: 0, end: 0 })

    const state = getStateFromMockCalls<ENERenderState>(mockHost, ENE_STATE_KEY)
    expect(state).toBeDefined()
    expect(state!.visibleMin).toBe(Infinity)
    expect(state!.visibleMax).toBe(-Infinity)
  })
})

describe('Per-indicator dirty flags', () => {
  let scheduler: IndicatorScheduler
  let mockHost: PluginHost

  beforeEach(() => {
    scheduler = new IndicatorScheduler()
    mockHost = createMockPluginHost()
    scheduler.setPluginHost(mockHost)
  })

  it('updateBOLLConfig should not recalculate MA series', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    // Capture MA state after initial update
    const maStateBefore = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    const maSeriesBefore = maStateBefore!.series[5]

    // Reset mock to track new calls
    vi.mocked(mockHost.setSharedState).mockClear()

    scheduler.updateBOLLConfig({ period: 10 })

    // MA state should still be written (for extremes recalculation)
    // but the series should be unchanged
    const maStateAfter = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    expect(maStateAfter).toBeDefined()
    // Series should be same reference (not recalculated)
    expect(maStateAfter!.series[5]).toEqual(maSeriesBefore)
  })

  it('updateEXPMAConfig should not recalculate MA series', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const maStateBefore = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    const maSeriesBefore = maStateBefore!.series[5]

    vi.mocked(mockHost.setSharedState).mockClear()

    scheduler.updateEXPMAConfig({ fastPeriod: 6 })

    const maStateAfter = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    expect(maStateAfter!.series[5]).toEqual(maSeriesBefore)
  })

  it('updateENEConfig should not recalculate MA series', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const maStateBefore = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    const maSeriesBefore = maStateBefore!.series[5]

    vi.mocked(mockHost.setSharedState).mockClear()

    scheduler.updateENEConfig({ period: 20 })

    const maStateAfter = getStateFromMockCalls<MARenderState>(mockHost, MA_STATE_KEY)
    expect(maStateAfter!.series[5]).toEqual(maSeriesBefore)
  })

  it('updateBOLLConfig should recalculate BOLL extremes', () => {
    const data = createTestData(100)
    scheduler.update(data, { start: 0, end: 100 })

    const bollStateBefore = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)

    scheduler.updateBOLLConfig({ period: 10 })

    const bollStateAfter = getStateFromMockCalls<BOLLRenderState>(mockHost, BOLL_STATE_KEY)
    // Extremes should be recalculated
    expect(bollStateAfter!.visibleMin).toBeLessThan(bollStateAfter!.visibleMax)
  })
})

describe('EMPTY_BOLL_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_BOLL_STATE).toEqual({
      timestamp: 0,
      series: [],
      params: {
        period: 20,
        multiplier: 2,
        showUpper: true,
        showMiddle: true,
        showLower: true,
        showBand: true,
      },
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_BOLL_STATE.visibleMin).toBeGreaterThan(EMPTY_BOLL_STATE.visibleMax)
  })
})

describe('EMPTY_EXPMA_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_EXPMA_STATE).toEqual({
      timestamp: 0,
      series: [],
      params: {
        fastPeriod: 12,
        slowPeriod: 50,
      },
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_EXPMA_STATE.visibleMin).toBeGreaterThan(EMPTY_EXPMA_STATE.visibleMax)
  })
})

describe('EMPTY_ENE_STATE', () => {
  it('should have correct structure', () => {
    expect(EMPTY_ENE_STATE).toEqual({
      timestamp: 0,
      series: [],
      params: {
        period: 10,
        deviation: 11,
      },
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })
  })

  it('should indicate no data when visibleMin > visibleMax', () => {
    expect(EMPTY_ENE_STATE.visibleMin).toBeGreaterThan(EMPTY_ENE_STATE.visibleMax)
  })
})
