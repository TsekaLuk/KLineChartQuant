import type { DataFetcher, KLineData } from '../controllers/types'

export const thousandMockDataFetcher: DataFetcher = async (_source, _config) => {
  console.log('[thousand-mock] generating 10k K-lines')
  const data: KLineData[] = []
  const startTime = new Date('2020-01-01').getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const totalDays = 10000

  const basePrice = 3000
  const meanReversionStrength = 0.0005
  const volatility = 0.02

  // raw random walk with mean reversion (close prices before bridge)
  const rawWalk: number[] = [basePrice]
  for (let i = 1; i < totalDays; i++) {
    const prev = rawWalk[i - 1]!
    const reversion = meanReversionStrength * (basePrice - prev)
    const change = (Math.random() - 0.5) * 2 * volatility * prev + reversion
    rawWalk.push(prev + change)
  }

  // Brownian bridge: subtract linear drift so last close = basePrice
  const finalOffset = rawWalk[totalDays - 1]! - basePrice
  for (let i = 0; i < totalDays; i++) {
    const bridge = finalOffset * (i / (totalDays - 1))
    const close = Math.round((rawWalk[i]! - bridge) * 100) / 100

    const timestamp = startTime + i * dayMs
    const open = i === 0 ? basePrice : data[i - 1]!.close

    const high = Math.round(Math.max(open, close) * (1 + Math.random() * 0.01) * 100) / 100
    const low = Math.round(Math.min(open, close) * (1 - Math.random() * 0.01) * 100) / 100
    const volume = Math.floor(1000000 + Math.random() * 5000000)
    data.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    })
  }

  return data
}
