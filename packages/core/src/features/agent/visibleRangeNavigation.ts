import { computeContentWidth, computeMaxScrollLeft } from '../../engine/state/contentGeometry'
import { getPhysicalKLineConfig } from '../../engine/utils/klineConfig'
import { deriveKGap, zoomLevelToKWidth } from '../../engine/utils/zoom'
import { clampVisibleRange, getVisibleRange } from '../../engine/viewport/viewport'
import { KLineChartError } from '../../errors'

import { CHART_AGENT_ERROR_CODES } from './errors'

export interface VisibleRangeNavigationInput {
  readonly timestamps: ReadonlyArray<number>
  readonly from: number
  readonly to: number
  readonly period: string
  readonly plotWidth: number
  readonly viewWidth: number
  readonly dpr: number
  readonly leftLoadBufferWidth: number
  readonly minKWidth: number
  readonly maxKWidth: number
  readonly zoomLevelCount: number
}

export interface VisibleRangeNavigationPlan {
  readonly zoomLevel: number
  readonly domScrollLeft: number
  readonly visibleFromIndex: number
  readonly visibleToIndex: number
  readonly clampedFrom: boolean
  readonly clampedTo: boolean
}

function lowerBound(values: ReadonlyArray<number>, target: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if ((values[middle] ?? Number.POSITIVE_INFINITY) < target) low = middle + 1
    else high = middle
  }
  return low
}

function fail(code: 'INVALID_ARGUMENTS' | 'NO_DATA' | 'OUT_OF_RANGE', message: string): never {
  throw new KLineChartError(code, message)
}

/** Pure timestamp-to-viewport geometry used by the public Agent facade. */
export function planVisibleRangeNavigation(
  input: VisibleRangeNavigationInput,
): VisibleRangeNavigationPlan {
  if (!Number.isFinite(input.from) || !Number.isFinite(input.to) || input.from > input.to) {
    fail(CHART_AGENT_ERROR_CODES.INVALID_QUERY, 'Visible range bounds must be finite and ordered')
  }
  if (
    input.period === 'timeshare' ||
    !Number.isFinite(input.plotWidth) ||
    input.plotWidth <= 0 ||
    !Number.isFinite(input.viewWidth) ||
    input.viewWidth <= 0 ||
    !Number.isFinite(input.dpr) ||
    input.dpr <= 0
  ) {
    fail(
      CHART_AGENT_ERROR_CODES.INVALID_QUERY,
      'Exact visible-range navigation requires a ready candlestick viewport',
    )
  }
  if (
    input.timestamps.length === 0 ||
    input.timestamps.some((timestamp) => !Number.isFinite(timestamp))
  ) {
    fail(
      CHART_AGENT_ERROR_CODES.NO_DATA,
      'Exact visible-range navigation requires timestamped data',
    )
  }
  for (let index = 1; index < input.timestamps.length; index += 1) {
    if ((input.timestamps[index] ?? 0) < (input.timestamps[index - 1] ?? 0)) {
      fail(CHART_AGENT_ERROR_CODES.INVALID_QUERY, 'Visible-range timestamps must be ordered')
    }
  }

  const firstTimestamp = input.timestamps[0]!
  const lastTimestamp = input.timestamps[input.timestamps.length - 1]!
  if (input.to < firstTimestamp || input.from > lastTimestamp) {
    fail(
      CHART_AGENT_ERROR_CODES.OUT_OF_RANGE,
      'Requested visible range does not overlap loaded data',
    )
  }

  const clampedFrom = input.from < firstTimestamp
  const clampedTo = input.to > lastTimestamp
  const boundedFrom = Math.max(input.from, firstTimestamp)
  const boundedTo = Math.min(input.to, lastTimestamp)
  const fromInsertion = lowerBound(input.timestamps, boundedFrom)
  const requestedFromIndex = Math.max(
    0,
    Math.min(
      input.timestamps.length - 1,
      input.timestamps[fromInsertion] === boundedFrom ? fromInsertion : fromInsertion - 1,
    ),
  )
  const requestedToIndex = Math.min(
    input.timestamps.length - 1,
    lowerBound(input.timestamps, boundedTo),
  )

  const levelCount = Math.max(2, Math.round(input.zoomLevelCount))
  let best:
    | (VisibleRangeNavigationPlan & { readonly visibleBars: number; readonly zoomLevel: number })
    | undefined

  for (let zoomLevel = 1; zoomLevel <= levelCount; zoomLevel += 1) {
    const kWidth = zoomLevelToKWidth(zoomLevel, {
      minKWidth: input.minKWidth,
      maxKWidth: input.maxKWidth,
      zoomLevelCount: levelCount,
    })
    const kGap = deriveKGap({ kWidth, dpr: input.dpr, period: input.period })
    const physical = getPhysicalKLineConfig(kWidth, kGap, input.dpr)
    const logicalScrollLeft =
      (physical.startXPx + (requestedFromIndex + 1) * physical.unitPx) / input.dpr
    const contentWidth = computeContentWidth({
      viewWidth: input.viewWidth,
      plotWidth: input.plotWidth,
      dataLength: input.timestamps.length,
      period: input.period,
      dpr: input.dpr,
      kWidth,
      kGap,
    })
    const maxScrollLeft = computeMaxScrollLeft(contentWidth, input.viewWidth)
    const domScrollLeft = Math.max(
      0,
      Math.min(input.leftLoadBufferWidth + logicalScrollLeft, maxScrollLeft),
    )
    const visible = clampVisibleRange(
      getVisibleRange(
        domScrollLeft - input.leftLoadBufferWidth,
        input.plotWidth,
        kWidth,
        kGap,
        input.timestamps.length,
        input.dpr,
      ),
    )
    const visibleFromIndex = Math.min(input.timestamps.length - 1, visible.start)
    const visibleToIndex = Math.max(
      visibleFromIndex,
      Math.min(input.timestamps.length - 1, visible.end - 1),
    )
    if (visibleFromIndex > requestedFromIndex || visibleToIndex < requestedToIndex) continue

    const candidate = {
      zoomLevel,
      domScrollLeft,
      visibleFromIndex,
      visibleToIndex,
      clampedFrom,
      clampedTo,
      visibleBars: visibleToIndex - visibleFromIndex + 1,
    }
    if (
      !best ||
      candidate.visibleBars < best.visibleBars ||
      (candidate.visibleBars === best.visibleBars && candidate.zoomLevel > best.zoomLevel)
    ) {
      best = candidate
    }
  }

  if (!best) {
    fail(
      CHART_AGENT_ERROR_CODES.OUT_OF_RANGE,
      'Requested visible range exceeds the supported viewport geometry',
    )
  }

  return Object.freeze({
    zoomLevel: best.zoomLevel,
    domScrollLeft: best.domScrollLeft,
    visibleFromIndex: best.visibleFromIndex,
    visibleToIndex: best.visibleToIndex,
    clampedFrom: best.clampedFrom || best.visibleFromIndex < Math.max(0, requestedFromIndex - 1),
    clampedTo:
      best.clampedTo ||
      best.visibleToIndex > Math.min(input.timestamps.length - 1, requestedToIndex + 1),
  })
}
