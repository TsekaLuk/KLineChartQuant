/** 实时 K 线须等待正式来源，并传递稳定品种身份、尊重品种能力。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarsCacheResult } from '@/data/buffer/impl/marketDataCache.js'
import type { LiveBarsDataSource, LiveBarsStream } from '@/data/live/types.js'
import {
  createTestChartDataManager,
  createTestDocument,
  createTestProvider,
  instrumentFor,
  makeBarsPage,
  makeKLine,
  makeTestSymbolSpec,
  registerTestProvider,
  unregisterTestProvider,
} from './helpers/chartDataManagerTestKit.js'

afterEach(() => {
  unregisterTestProvider()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe.each(['test', 'auto'])('live bars with %s selection', (source) => {
  it.each([undefined, true, false])(
    'uses resolved identity and respects instrument liveBars=%s',
    async (liveBars) => {
      const stream: LiveBarsStream = {
        onFrame: () => () => {},
        onStatus: () => () => {},
        onError: () => () => {},
        connect: vi.fn(),
        disconnect: vi.fn(),
        destroy: vi.fn(),
      }
      const createStream = vi.fn<LiveBarsDataSource['createStream']>(() => stream)
      const provider = createTestProvider({})
      registerTestProvider({
        ...provider,
        source: {
          ...provider.source,
          capabilities: {
            ...provider.source.capabilities,
            assetClasses: ['stock'],
            liveBars: true,
          },
        },
        liveBars: { createStream },
      })
      const instrument = {
        ...instrumentFor('000001'),
        id: 'test:SZ:000001',
        capabilities: { ...instrumentFor('000001').capabilities, liveBars },
      }
      const { manager } = createTestChartDataManager(createTestDocument())
      let finishLoad: ((result: BarsCacheResult) => void) | undefined
      vi.spyOn(manager.marketDataCache, 'queryBars').mockImplementation(
        () =>
          new Promise<BarsCacheResult>((resolve) => {
            finishLoad = resolve
          }),
      )
      try {
        manager.setSymbols([makeTestSymbolSpec('000001', { source })])
        expect(createStream).not.toHaveBeenCalled()
        const page = makeBarsPage([makeKLine(100)], { instrumentId: instrument.id })
        expect(finishLoad).toBeDefined()
        finishLoad?.({
          sourceId: 'test',
          instrument,
          series: { ...page, barAggregation: 'original' },
        })
        await vi.waitFor(() => expect(manager.dataBuffer.loading.peek()).toBe(false))
        if (liveBars === false) {
          expect(createStream).not.toHaveBeenCalled()
        } else {
          expect(createStream).toHaveBeenCalledExactlyOnceWith({
            symbol: '000001',
            period: 'daily',
            barAggregation: 'original',
            instrumentId: instrument.id,
          })
          expect(stream.connect).toHaveBeenCalledOnce()
        }
      } finally {
        manager.destroy()
      }
      expect(stream.destroy).toHaveBeenCalledTimes(liveBars === false ? 0 : 1)
    },
  )
})
