export function _computeEMASeries(values: (number | undefined)[], period: number): (number | undefined)[] {
    const n = values.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0) return result

    const alpha = 2 / (period + 1)

    let i = 0
    while (i < n && values[i] === undefined) i++
    if (i >= n) return result

    let ema = values[i]!
    result[i] = ema
    for (let t = i + 1; t < n; t++) {
        const v = values[t]
        if (v === undefined) continue
        ema = v * alpha + ema * (1 - alpha)
        result[t] = ema
    }
    return result
}

export function _computeWMAOnNumbers(values: (number | undefined)[], period: number): (number | undefined)[] {
    const n = values.length
    const result: (number | undefined)[] = new Array(n).fill(undefined)
    if (n === 0 || period <= 0 || n < period) return result

    const denom = (period * (period + 1)) / 2

    for (let t = period - 1; t < n; t++) {
        let sw = 0
        let valid = true
        for (let k = 0; k < period; k++) {
            const v = values[t - period + 1 + k]
            if (v === undefined) {
                valid = false
                break
            }
            sw += (k + 1) * v
        }
        if (valid) result[t] = sw / denom
    }
    return result
}
