import type { DataFetcher, KLineData } from '../controllers/types'

const PERIOD_TO_CATEGORY: Record<string, number> = {
  '5min': 0,
  '15min': 1,
  '30min': 2,
  '60min': 3,
  daily: 4,
  weekly: 5,
  monthly: 6,
}

const ADJUST_MAP: Record<string, number> = {
  none: 0,
  qfq: 1,
  hfq: 2,
  splits: 0,
}

const EXCHANGE_EX_CATEGORY: Record<string, number> = {
  US: 74,
  HK: 71,
  SG: 78,
  DE: 73,
}

interface SecurityBar {
  Last: number
  Open: number
  Close: number
  High: number
  Low: number
  Vol: number
  Amount: number
  Turnover: number
  RisePrice: number
  RiseRate: number
  Year: number
  Month: number
  Day: number
  Hour: number
  Minute: number
  DateTime: string
  UpCount: number
  DownCount: number
}

interface ExKLineItem {
  DateTime: string
  Open: number
  High: number
  Low: number
  Close: number
  Amount: number
  Vol: number
}

function mapBar(item: SecurityBar, code: string): KLineData {
  const ts = new Date(item.DateTime).getTime()
  return {
    timestamp: ts,
    date: item.DateTime.split('T')[0],
    open: item.Open,
    high: item.High,
    low: item.Low,
    close: item.Close,
    volume: item.Vol,
    turnover: item.Amount,
    turnoverRate: item.Turnover,
    changeAmount: item.RisePrice,
    changePercent: item.RiseRate,
    stockCode: code,
  }
}

function mapExItem(item: ExKLineItem, code: string): KLineData {
  const ts = new Date(item.DateTime).getTime()
  return {
    timestamp: ts,
    date: item.DateTime.split('T')[0],
    open: item.Open,
    high: item.High,
    low: item.Low,
    close: item.Close,
    volume: item.Vol,
    turnover: item.Amount,
    stockCode: code,
  }
}

export const gotdxDataFetcher: DataFetcher = async (source, config) => {
  const baseUrl = source === 'gotdx' ? 'http://127.0.0.1:8080' : ''

  if (config.exchange && config.exchange in EXCHANGE_EX_CATEGORY) {
    const category = EXCHANGE_EX_CATEGORY[config.exchange]
    const period = PERIOD_TO_CATEGORY[config.period] ?? 4
    const body = {
      category,
      code: config.symbol,
      period,
      start_date: config.startDate,
      end_date: config.endDate,
      times: 1,
    }
    const res = await fetch(`${baseUrl}/api/ex/kline-by-date`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`[gotdx] ex/kline-by-date failed: ${res.status} ${res.statusText}`)
    const list: ExKLineItem[] = await res.json()
    return list.map((item) => mapExItem(item, config.symbol))
  }

  const market = config.symbol.startsWith('6') || config.symbol.startsWith('9') ? 1 : 0
  const category = PERIOD_TO_CATEGORY[config.period] ?? 4
  const adjust = ADJUST_MAP[config.adjust] ?? 0
  const body = {
    market,
    code: config.symbol,
    category,
    start_date: config.startDate,
    end_date: config.endDate,
    times: 1,
    adjust,
  }
  const res = await fetch(`${baseUrl}/api/stock/kline-by-date`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`[gotdx] stock/kline-by-date failed: ${res.status} ${res.statusText}`)
  const list: SecurityBar[] = await res.json()
  return list.map((item) => mapBar(item, config.symbol))
}
