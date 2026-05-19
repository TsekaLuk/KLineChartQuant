import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IndicatorScheduler } from '../scheduler'
import { MA_STATE_KEY, EMPTY_MA_STATE, type MARenderState } from '../maState'
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

      const callArgs = vi.mocked(mockHost.setSharedState).mock.calls[0]
      const state = callArgs[1] as unknown as MARenderState

      expect(state.enabledPeriods).toContain(5)
      expect(state.enabledPeriods).toContain(10)
      expect(state.enabledPeriods).toContain(20)
      expect(state.enabledPeriods).toContain(30)
      expect(state.enabledPeriods).toContain(60)
    })

    it('should set correct visibleMin and visibleMax for full range', () => {
      // Data: 100, 101, 102, ... 199
      const data = createTestData(100, 100)
      const visibleRange = { start: 60, end: 70 } // Viewing prices 160-169

      scheduler.update(data, visibleRange)

      const callArgs = vi.mocked(mockHost.setSharedState).mock.calls[0]
      const state = callArgs[1] as unknown as MARenderState

      // MA5 of prices 160-169 should be between 156-169
      expect(state.visibleMin).toBeLessThan(state.visibleMax)
      expect(state.visibleMax).toBeGreaterThan(150)
    })

    it('should handle empty data', () => {
      const data: KLineData[] = []
      const visibleRange = { start: 0, end: 0 }

      scheduler.update(data, visibleRange)

      const callArgs = vi.mocked(mockHost.setSharedState).mock.calls[0]
      const state = callArgs[1] as unknown as MARenderState

      expect(state.visibleMin).toBe(Infinity)
      expect(state.visibleMax).toBe(-Infinity)
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

      const callArgs = vi.mocked(mockHost.setSharedState).mock.lastCall
      const state = callArgs![1] as unknown as MARenderState

      expect(state.enabledPeriods).toContain(5)
      expect(state.enabledPeriods).toContain(20)
      expect(state.enabledPeriods).not.toContain(10)
      expect(state.enabledPeriods).not.toContain(30)
      expect(state.enabledPeriods).not.toContain(60)
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

      const callArgs = vi.mocked(mockHost.setSharedState).mock.lastCall
      const state = callArgs![1] as unknown as MARenderState

      expect(state.enabledPeriods).toHaveLength(0)
      expect(state.visibleMin).toBe(Infinity)
      expect(state.visibleMax).toBe(-Infinity)
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

      // Should still write to state store
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(1)

      const callArgs = vi.mocked(mockHost.setSharedState).mock.calls[0]
      const state = callArgs[1] as unknown as MARenderState

      // Extremes should be recalculated for new viewport
      expect(state.visibleMin).toBeLessThan(state.visibleMax)
    })

    it('should recalculate series on data change', () => {
      const data1 = createTestData(100)
      scheduler.update(data1, { start: 0, end: 100 })

      const data2 = createTestData(100, 200)
      scheduler.update(data2, { start: 0, end: 100 })

      // Should be called twice (once for each data update)
      expect(mockHost.setSharedState).toHaveBeenCalledTimes(2)
    })
  })

  describe('recompute', () => {
    it('should force full recalculation', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      vi.mocked(mockHost.setSharedState).mockClear()

      scheduler.recompute()

      expect(mockHost.setSharedState).toHaveBeenCalledTimes(1)
    })

    it('should recalculate with same data and range', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const firstCall = vi.mocked(mockHost.setSharedState).mock.calls[0]
      const firstState = firstCall[1] as { timestamp: number }

      // Small delay to ensure different timestamp
      const start = Date.now()
      while (Date.now() < start + 2) { /* busy wait */ }

      scheduler.recompute()

      const secondCall = vi.mocked(mockHost.setSharedState).mock.calls[1]
      const secondState = secondCall[1] as { timestamp: number }

      // Timestamps should be different (or at least not earlier)
      expect(secondState.timestamp).toBeGreaterThanOrEqual(firstState.timestamp)
    })
  })

  describe('series data structure', () => {
    it('should store series as Record with period keys', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const callArgs = vi.mocked(mockHost.setSharedState).mock.calls[0]
      const state = callArgs[1] as unknown as MARenderState

      // Series should be a Record/object with string keys (numbers become strings in JS objects)
      expect(typeof state.series).toBe('object')
      expect(state.series[5]).toBeDefined()
      expect(Array.isArray(state.series[5])).toBe(true)
      expect(state.series[5]).toHaveLength(100)
    })

    it('should have undefined values for indices before period-1', () => {
      const data = createTestData(100)
      scheduler.update(data, { start: 0, end: 100 })

      const callArgs = vi.mocked(mockHost.setSharedState).mock.calls[0]
      const state = callArgs[1] as unknown as MARenderState

      // First 4 values of MA5 should be undefined
      expect(state.series[5][0]).toBeUndefined()
      expect(state.series[5][3]).toBeUndefined()
      expect(state.series[5][4]).toBeDefined()
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
