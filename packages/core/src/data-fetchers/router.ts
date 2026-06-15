import type { DataFetcher } from '../controllers/types'
import { baostockDataFetcher } from './baostock'
import { gotdxDataFetcher } from './gotdx'
import { hundredMockDataFetcher } from './hundred-mock'
import { thousandMockDataFetcher } from './thousand-mock'
import { tradingviewDataFetcher } from './tradingview'

export const routerDataFetcher: DataFetcher = (source, config) => {
  switch (source) {
    case 'baostock':
      return baostockDataFetcher(source, config)
    case 'gotdx':
      return gotdxDataFetcher(source, config)
    case 'tradingview':
      return tradingviewDataFetcher(source, config)
    case 'mock-100':
      return hundredMockDataFetcher(source, config)
    case 'mock-10000':
      return thousandMockDataFetcher(source, config)
    default:
      return hundredMockDataFetcher(source, config)
  }
}
