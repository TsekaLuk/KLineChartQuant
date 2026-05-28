/**
 * Mock K-line data used by the SSR smoke test.
 *
 * Generated deterministically (no Math.random side effects) so the build
 * is reproducible. 100 candles is plenty to prove the adapter loads.
 */

export interface MockCandle {
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume: number
}

export function buildMockCandles(count: number = 100): MockCandle[] {
    const base = 100
    const startTs = 1_700_000_000_000
    const oneDay = 86_400_000
    const out: MockCandle[] = []
    for (let i = 0; i < count; i++) {
        const drift = Math.sin(i / 7) * 5
        const open = base + drift
        const close = open + Math.cos(i / 5) * 2
        const high = Math.max(open, close) + 1.5
        const low = Math.min(open, close) - 1.5
        out.push({
            timestamp: startTs + i * oneDay,
            open,
            high,
            low,
            close,
            volume: 1000 + i * 10,
        })
    }
    return out
}
