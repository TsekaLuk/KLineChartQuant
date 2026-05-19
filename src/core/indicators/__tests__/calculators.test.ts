import { describe, it, expect } from 'vitest'
import { calcMAData, DEFAULT_MA_PERIODS } from '../calculators'
import type { KLineData } from '@/types/price'

/**
 * 创建测试用的 K 线数据
 * 收盘价序列: 10, 11, 12, 13, 14, 15, 16, 17, 18, 19
 */
function createTestData(prices: number[]): KLineData[] {
  return prices.map((close, index) => ({
    timestamp: 1000000000000 + index * 60000,
    open: close - 0.5,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 1000 + index * 100,
  }))
}

describe('calcMAData', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  const data = createTestData(prices)

  it('should return array of same length as input', () => {
    const result = calcMAData(data, 5)
    expect(result).toHaveLength(data.length)
  })

  it('should return undefined for indices before period-1', () => {
    const result = calcMAData(data, 5)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
    expect(result[3]).toBeUndefined()
  })

  it('should calculate correct MA5 values using sliding window', () => {
    const result = calcMAData(data, 5)

    // MA5 at index 4: (10+11+12+13+14)/5 = 60/5 = 12
    expect(result[4]).toBeCloseTo(12, 2)

    // MA5 at index 5: (11+12+13+14+15)/5 = 65/5 = 13
    expect(result[5]).toBeCloseTo(13, 2)

    // MA5 at index 9: (15+16+17+18+19)/5 = 85/5 = 17
    expect(result[9]).toBeCloseTo(17, 2)
  })

  it('should calculate correct MA3 values', () => {
    const result = calcMAData(data, 3)

    // MA3 at index 2: (10+11+12)/3 = 11
    expect(result[2]).toBeCloseTo(11, 2)

    // MA3 at index 3: (11+12+13)/3 = 12
    expect(result[3]).toBeCloseTo(12, 2)

    // MA3 at index 4: (12+13+14)/3 = 13
    expect(result[4]).toBeCloseTo(13, 2)
  })

  it('should handle period=1 (return close price)', () => {
    const result = calcMAData(data, 1)

    for (let i = 0; i < data.length; i++) {
      expect(result[i]).toBeCloseTo(data[i].close, 2)
    }
  })

  it('should return all undefined when data length < period', () => {
    const shortData = createTestData([10, 11, 12])
    const result = calcMAData(shortData, 5)

    expect(result).toHaveLength(3)
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
    expect(result[2]).toBeUndefined()
  })

  it('should handle empty data', () => {
    const result = calcMAData([], 5)
    expect(result).toHaveLength(0)
  })

  it('should produce consistent results with manual calculation', () => {
    const result = calcMAData(data, 5)

    // Manual verification of sliding window
    for (let i = 4; i < data.length; i++) {
      let sum = 0
      for (let j = 0; j < 5; j++) {
        sum += data[i - j].close
      }
      const expected = sum / 5
      expect(result[i]).toBeCloseTo(expected, 2)
    }
  })

  it('should handle large datasets efficiently', () => {
    const largePrices = Array.from({ length: 10000 }, (_, i) => 100 + i)
    const largeData = createTestData(largePrices)

    const start = performance.now()
    const result = calcMAData(largeData, 60)
    const end = performance.now()

    // Should complete in reasonable time (< 100ms for 10k items)
    expect(end - start).toBeLessThan(100)

    // Verify last value is correct
    // Last 60 values are indices 9940-9999, prices are 100+9940=10040 to 100+9999=10099
    // sum = (10040 + 10099) * 60 / 2 = 604170, avg = 10069.5
    const lastIdx = largeData.length - 1
    expect(result[lastIdx]).toBeCloseTo(10069.5, 1)
  })
})

describe('DEFAULT_MA_PERIODS', () => {
  it('should contain standard MA periods', () => {
    expect(DEFAULT_MA_PERIODS).toEqual([5, 10, 20, 30, 60])
  })

  it('should be readonly array', () => {
    // Type check - this is more of a compile-time check
    // but we verify the values are as expected
    expect(DEFAULT_MA_PERIODS).toHaveLength(5)
    expect(DEFAULT_MA_PERIODS[0]).toBe(5)
    expect(DEFAULT_MA_PERIODS[4]).toBe(60)
  })
})
