# Performance baseline

Locked-in numbers from `pnpm bench` (vitest 4.1 + tinybench).
Re-run on the same hardware to detect regressions.

**Machine**: M-series Mac, Node 20.19.
**Date locked**: 2026-05-29 (tick 32, commit `b-28`).

Where indicator math sits relative to the renderer:

```
  one frame budget @ 60 fps = 16.67 ms
                              └─ indicator recompute  (this doc)
                              └─ scene update
                              └─ GPU upload + draw
```

Anything in this doc is the **upper bound** on the indicator slice.
Live workloads only recompute the trailing window, so real budget
consumption is several orders of magnitude smaller than the
full-recompute numbers below.

---

## Signal layer (`signal.bench.ts`, b-1)

| Op | Time |
|---|---|
| `Signal.set` (no subscribers) | 13–17 ns |
| `Signal.set` (5 subscribers) | 18–22 ns |
| `effect()` re-entry | 28–32 ns |

---

## Scale (`scale.bench.ts`, b-1)

| Op | Time |
|---|---|
| Anchored zoom (visible range 0–10 000) | 19.5 ns |
| Origin-shift rebaseline check | 9.3 ns |

---

## Volume Profile (`volumeProfile.bench.ts`, b-1)

`binBarToBuckets` over typical-price input.

| Bars | Time |
|---|---|
| 1 000 | 56 µs |
| 10 000 | 540 µs |
| 100 000 | 4.32–5.59 ms |

---

## Order Book Heatmap (`orderBookHeatmap.bench.ts`, b-1)

| Op | Time |
|---|---|
| `applyDelta` (single-tick update) | 68 ns |
| `snapshot()` (10 000-level book) | 33 µs |

---

## Indicator pack (`indicators.bench.ts`, b-28)

Full recompute over a deterministic `sin + cos`-driven close series.

### MA family @ 10 000 bars

| Indicator | hz | µs / call |
|---|---|---|
| ZLEMA (period=21) | ~1.5 M | 0.7 |
| VIDYA (period=21, cmoPeriod=9) | ~850 k | 1.2 |
| ALMA (period=21) | ~210 k | 4.8 |
| T3 (period=21, volumeFactor=0.7) | ~180 k | 5.5 |
| LSMA (period=21) | ~115 k | 8.7 |
| FRAMA (period=16) | ~38 k | 26 |

### MA family @ 100 000 bars

| Indicator | hz | µs / call |
|---|---|---|
| ZLEMA (period=21) | ~150 k | 6.7 |
| VIDYA (period=21, cmoPeriod=9) | ~94 k | 11 |
| T3 (period=21, volumeFactor=0.7) | ~18 k | 55 |
| ALMA (period=21) | ~17 k | 59 |
| LSMA (period=21) | ~11 k | 92 |
| FRAMA (period=16) | ~4.4 k | 230 |

### Oscillators @ 10 000 bars

| Indicator | hz | µs / call |
|---|---|---|
| DPO (period=20) | ~30 k | 33 |
| StochRSI (period=14, kPeriod=3, dPeriod=3) | ~18 k | 56 |
| Awesome Oscillator (fast=5, slow=34) | ~10 k | 100 |
| Ultimate Oscillator (p1=7, p2=14, p3=28) | ~4.1 k | 240 |
| Fisher Transform (period=10) | ~1.8 k | 560 |
| Schaff Trend Cycle (fast=23, slow=50, cycle=10, factor=0.5) | ~1.7 k | 580 |

### Oscillators @ 100 000 bars

| Indicator | hz | µs / call |
|---|---|---|
| DPO (period=20) | 3 360 | 298 |
| StochRSI (period=14, kPeriod=3, dPeriod=3) | 2 826 | 354 |
| Awesome Oscillator (fast=5, slow=34) | 1 391 | 719 |
| Ultimate Oscillator (p1=7, p2=14, p3=28) | 547 | 1 828 |
| Schaff Trend Cycle (fast=23, slow=50, cycle=10, factor=0.5) | 295 | 3 385 |
| Fisher Transform (period=10) | 265 | 3 778 |

### How to read these numbers

- **All 18 indicators × 100 k bars together** — sum of full-recompute
  times is dominated by Fisher + STC at ~3.8 ms each. Even the worst
  case "everything recomputed from scratch over 100 k bars every
  frame" stays under one 16.67 ms frame budget if you cap to ~4 at
  once. Real workloads recompute only the trailing window per tick,
  so practical budget consumption is microseconds.

- **vs TradingView (anecdotal)** — the team observed IK + 3-year-range
  rendering "crushes TV". The numbers above bound the math-tier
  contribution. The remaining headroom belongs to the renderer; this
  doc gives the math floor so future renderer work has a clean budget.

---

## Notes on methodology

- `vitest bench` (tinybench under the hood). Each test runs for at least
  1 s of wall-clock or 500 samples, whichever is greater.
- Inputs are deterministic — fixtures are seeded via `sin + cos`, not
  `Math.random`. Repeat runs are stable within ~2 % rme.
- No DOM, no GPU. Pure-function math on `Float64Array` inputs.
- Numbers vary across hardware. CI publishes baselines; regression
  detection wiring is queued for a follow-up tick.
