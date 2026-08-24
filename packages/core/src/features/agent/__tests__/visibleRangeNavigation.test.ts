import { describe, expect, it } from 'vitest'

import { planVisibleRangeNavigation } from '../visibleRangeNavigation'

const timestamps = Array.from({ length: 120 }, (_, index) => 1_000 + index * 60_000)

function fixture(overrides: Partial<Parameters<typeof planVisibleRangeNavigation>[0]> = {}) {
  return {
    timestamps,
    from: timestamps[20]!,
    to: timestamps[50]!,
    period: 'minute',
    plotWidth: 640,
    viewWidth: 640,
    dpr: 2,
    leftLoadBufferWidth: 640,
    minKWidth: 1,
    maxKWidth: 50,
    zoomLevelCount: 20,
    ...overrides,
  }
}

describe('planVisibleRangeNavigation', () => {
  it('selects the tightest supported zoom and reports non-exact geometry', () => {
    const plan = planVisibleRangeNavigation(fixture())

    expect(plan.visibleFromIndex).toBeLessThanOrEqual(20)
    expect(plan.visibleToIndex).toBeGreaterThanOrEqual(50)
    expect(plan.visibleFromIndex).toBeGreaterThanOrEqual(19)
    expect(plan.visibleToIndex).toBe(53)
    expect(plan.zoomLevel).toBeGreaterThan(1)
    expect(plan.domScrollLeft).toBeGreaterThan(0)
    expect(plan.clampedFrom).toBe(false)
    expect(plan.clampedTo).toBe(true)
  })

  it('uses adjacent bars for irregular timestamp boundaries', () => {
    const irregular = [1_000, 2_000, 5_000, 9_000, 15_000, 22_000]
    const plan = planVisibleRangeNavigation(
      fixture({ timestamps: irregular, from: 5_500, to: 14_000, plotWidth: 120, viewWidth: 120 }),
    )

    expect(plan.visibleFromIndex).toBeLessThanOrEqual(2)
    expect(plan.visibleToIndex).toBeGreaterThanOrEqual(4)
  })

  it('reports partial loaded-range clamping and rejects disjoint ranges', () => {
    expect(
      planVisibleRangeNavigation(fixture({ from: timestamps[0]! - 10, to: timestamps[5]! })),
    ).toMatchObject({ clampedFrom: true, clampedTo: true })
    expect(
      planVisibleRangeNavigation(fixture({ from: timestamps[115]!, to: timestamps[119]! + 10 })),
    ).toMatchObject({ clampedTo: true })

    expect(() => planVisibleRangeNavigation(fixture({ from: -2_000, to: -1_000 }))).toThrowError(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    )
  })

  it('rejects invalid, timeshare, unordered, and unsupported oversized geometry', () => {
    expect(() => planVisibleRangeNavigation(fixture({ from: Number.NaN }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_ARGUMENTS' }),
    )
    expect(() => planVisibleRangeNavigation(fixture({ period: 'timeshare' }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_ARGUMENTS' }),
    )
    expect(() => planVisibleRangeNavigation(fixture({ timestamps: [2_000, 1_000] }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_ARGUMENTS' }),
    )
    expect(() =>
      planVisibleRangeNavigation(
        fixture({ from: timestamps[0]!, to: timestamps[119]!, plotWidth: 4, viewWidth: 4 }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'OUT_OF_RANGE' }))
  })
})
