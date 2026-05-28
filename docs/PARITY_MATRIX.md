# TradingView Parity Matrix

> Structured feature-by-feature mapping vs TradingView (Lightweight Charts + Advanced Charts + Pine ecosystem). Companion to [`COMPETITIVE_ANALYSIS.md`](./COMPETITIVE_ANALYSIS.md) — the narrative summary; this is the spreadsheet for triage.
>
> **Status legend** —
> ✅ SUPERSEDED · we have it, with cited evidence
> ⚠️ GAP-easy · ≤ 2 weeks of focused work, file pointer where it would land
> ❌ GAP-hard · months / strategic decision required
> 🚫 OUT-OF-SCOPE · deliberately not pursued
>
> Updated by LOOP tick 6 (2026-05-29). Future ticks extend this; never silently change a ✅ to ❌ without DEAD_ENDS justification.

---

## 1 · Indicators

**TV exposes ~150 built-in indicators across 8 categories.** Pine v6 (Jan 2026 release) adds `request.footprint()` and `request.volume_row()` data primitives but ships no native Footprint chart UI.

### 1.1 Moving averages

| Indicator | TV native? | Our status | Source / where |
|---|---|---|---|
| SMA / MA | yes | ✅ SUPERSEDED | `src/core/indicators/maState.ts` |
| EMA | yes | ⚠️ GAP-easy — wired via legacy EXPMA path; add explicit alias | `src/core/indicators/expmaState.ts` |
| WMA | yes | ✅ SUPERSEDED | `src/core/indicators/wmaState.ts` |
| DEMA | yes | ✅ SUPERSEDED | `src/core/indicators/demaState.ts` |
| TEMA | yes | ✅ SUPERSEDED | `src/core/indicators/temaState.ts` |
| HMA | yes | ✅ SUPERSEDED | `src/core/indicators/hmaState.ts` |
| KAMA | yes | ✅ SUPERSEDED | `src/core/indicators/kamaState.ts` |
| ALMA | yes | ✅ SUPERSEDED | `packages/core/src/indicators/alma.ts` (tick 7 b-9) |
| T3 | yes | ✅ SUPERSEDED | `packages/core/src/indicators/t3.ts` (tick 7 b-9) |
| ZLEMA | yes | ✅ SUPERSEDED | `packages/core/src/indicators/zlema.ts` (tick 7 b-9) |
| VIDYA | yes | ✅ SUPERSEDED | `packages/core/src/indicators/vidya.ts` (tick 7 b-9) |
| FRAMA | yes | ✅ SUPERSEDED (close-input variant — documented divergence vs H/L) | `packages/core/src/indicators/frama.ts` (tick 7 b-9) |
| LSMA (linreg) | yes | ✅ SUPERSEDED | `packages/core/src/indicators/lsma.ts` (tick 7 b-9) |
| Anchored MA | no | ❌ GAP-hard — sit on top of our `AnchoredVwapController` pattern; new component | new package or extension to `anchoredVwap/` |

### 1.2 Oscillators

| Indicator | TV native? | Our status | Source |
|---|---|---|---|
| RSI | yes | ✅ SUPERSEDED | `src/core/indicators/rsiState.ts` |
| Stochastic | yes | ✅ SUPERSEDED | `src/core/indicators/stochState.ts` |
| Stoch RSI | yes | ⚠️ GAP-easy | new — composes Stoch + RSI |
| MACD | yes | ✅ SUPERSEDED | `src/core/indicators/macdState.ts` |
| CCI | yes | ✅ SUPERSEDED | `src/core/indicators/cciState.ts` |
| Williams %R | yes | ✅ SUPERSEDED | `src/core/indicators/wmsrState.ts` |
| Awesome Oscillator | yes | ⚠️ GAP-easy | new |
| ROC | yes | ✅ SUPERSEDED | `src/core/indicators/rocState.ts` |
| MOM | yes | ✅ SUPERSEDED | `src/core/indicators/momState.ts` |
| TRIX | yes | ✅ SUPERSEDED | `src/core/indicators/trixState.ts` |
| KST | yes | ✅ SUPERSEDED | `src/core/indicators/kstState.ts` |
| Ultimate Oscillator | yes | ⚠️ GAP-easy | new |
| DPO | yes | ⚠️ GAP-easy | new |
| Fisher Transform | yes | ⚠️ GAP-easy | new |
| Schaff Trend Cycle | yes | ⚠️ GAP-easy | new |

### 1.3 Volatility

| Indicator | TV native? | Our status | Source |
|---|---|---|---|
| Bollinger Bands | yes | ✅ SUPERSEDED | `src/core/indicators/bollState.ts` |
| ATR | yes | ✅ SUPERSEDED | `src/core/indicators/atrState.ts` |
| Keltner Channels | yes | ✅ SUPERSEDED | `src/core/indicators/keltnerState.ts` |
| Donchian Channels | yes | ✅ SUPERSEDED | `src/core/indicators/donchianState.ts` |
| ENE (envelopes) | yes | ✅ SUPERSEDED | `src/core/indicators/eneState.ts` |
| Standard Deviation | yes | ⚠️ GAP-easy | new |
| Historical Volatility | yes | ✅ SUPERSEDED | `src/core/indicators/hvState.ts` |
| Parkinson Volatility | no | ✅ SUPERSEDED (we exceed) | `src/core/indicators/parkinsonState.ts` |
| Chaikin Volatility | yes | ✅ SUPERSEDED | `src/core/indicators/chaikinVolState.ts` |
| Bollinger Bandwidth | yes | ⚠️ GAP-easy — derived | new |
| %B | yes | ⚠️ GAP-easy — derived | new |
| Choppiness Index | yes | ⚠️ GAP-easy | new |
| NATR | yes | ⚠️ GAP-easy — normalized ATR | new |

### 1.4 Volume

| Indicator | TV native? | Our status | Source |
|---|---|---|---|
| Volume Bars | yes | ✅ SUPERSEDED | legacy renderer |
| OBV | yes | ✅ SUPERSEDED | `src/core/indicators/obvState.ts` |
| Volume MA | yes | ✅ SUPERSEDED | `src/core/indicators/vmaState.ts` |
| A/D Line | yes | ⚠️ GAP-easy | new |
| CMF | yes | ✅ SUPERSEDED | `src/core/indicators/cmfState.ts` |
| MFI | yes | ✅ SUPERSEDED | `src/core/indicators/mfiState.ts` |
| PVT | yes | ✅ SUPERSEDED | `src/core/indicators/pvtState.ts` |
| VWAP | yes (1× session) | ✅ SUPERSEDED (session) + ✅ SUPERSEDED (Anchored, unlimited) | `src/core/indicators/vwapState.ts` + `packages/core/src/components/anchoredVwap/` |
| Chaikin Money Flow | yes | ✅ SUPERSEDED (= CMF) | (alias of CMF) |
| Ease of Movement | yes | ⚠️ GAP-easy | new |
| Volume Profile (fixed range) | TV Premium only | ✅ SUPERSEDED — FREE | `packages/core/src/components/volumeProfile/` |
| Volume Profile (visible range) | TV Premium only | ⚠️ GAP-easy — same controller + viewport binding | extension of existing VP |
| Volume Profile (session) | TV Premium only | ⚠️ GAP-easy — same controller + session detector | extension of existing VP |
| Volume Profile (period) | TV Premium only | ⚠️ GAP-easy | extension |
| Cumulative Volume Delta | TV Pine-only since v6 | ✅ SUPERSEDED — native | `packages/core/src/components/footprint/` exposes `cumulativeDelta` signal |
| Order Book Heatmap | **NOT IN TV** | ✅ SUPERSEDED (we exceed) | `packages/core/src/components/orderBookHeatmap/` — dual snapshot+delta storage |
| Footprint | **TV Pine v6 data only, no UI** | ✅ SUPERSEDED (we exceed) | `packages/core/src/components/footprint/` — full controller + 32 tests |

### 1.5 Trend / structure

| Indicator | TV native? | Our status | Source |
|---|---|---|---|
| Parabolic SAR | yes | ✅ SUPERSEDED | `src/core/indicators/sarState.ts` |
| Ichimoku Cloud | yes | ✅ SUPERSEDED | `src/core/indicators/ichimokuState.ts` |
| SuperTrend | yes | ✅ SUPERSEDED | `src/core/indicators/supertrendState.ts` |
| ADX / DI | yes | ⚠️ GAP-easy | new |
| Pivot Points | yes | ✅ SUPERSEDED | `src/core/indicators/pivotState.ts` |
| Fibonacci retracement (indicator form) | yes | ✅ SUPERSEDED | `src/core/indicators/fibState.ts` |
| Market Structure (BOS / CHOCH) | TV via 3rd-party only | ✅ SUPERSEDED — native | `src/core/indicators/structureState.ts` |
| Fair Value Gaps / Order Blocks | TV via LuxAlgo paid only (~$40/mo) | ✅ SUPERSEDED — MIT free | `src/core/indicators/zonesState.ts` |
| Liquidity sweeps | 3rd-party only | ⚠️ GAP-easy — extension of structure | new |
| ZigZag | yes | ⚠️ GAP-easy | new |
| Linear Regression Channel | yes | ⚠️ GAP-easy | new |

### 1.6 Statistical / niche

| Indicator | TV native? | Our status | Source |
|---|---|---|---|
| Z-Score | yes | ⚠️ GAP-easy | new |
| Correlation Coefficient | yes | ⚠️ GAP-easy | new (needs multi-symbol) |
| Beta | yes | ⚠️ GAP-easy | new (needs benchmark series) |
| Open Interest | crypto perps native | ❌ GAP-hard — needs exchange-specific datasource | data integration |
| Funding Rate | crypto perps native | ❌ GAP-hard — same | data integration |
| Liquidations | TV via 3rd-party | ❌ GAP-hard — datasource | data integration |

### 1.7 Multi-timeframe (MTF)

| Capability | TV native? | Our status | Source |
|---|---|---|---|
| Display higher-tf indicator on lower-tf chart | TV Pro+ tier | ✅ SUPERSEDED — unlimited | `packages/core/src/components/mtfOverlay/` |
| No-lookahead enforcement | hidden in TV | ✅ SUPERSEDED — explicit test | `alignToBaseIndex.test.ts` lookahead-bias case |
| Indicator-agnostic compute fn | not exposed in TV | ✅ SUPERSEDED — `MtfSeriesDefinition.compute` is user-supplied | architecture win |

---

## 2 · Drawing tools

**TV exposes ~80+ drawing tools** across trend lines, fibs, geometric, annotation, patterns, forecasting. Legacy `src/core/drawing/` ships ~12 today.

| Category | TV inventory (representative) | Our status | Gap effort |
|---|---|---|---|
| Trend lines | line, ray, extended line, arrow, parallel channel, regression channel, pitchfork (4 variants) | ⚠️ GAP-easy on line + ray + extended; ❌ GAP-hard on pitchfork (Schiff/Modified Schiff/Inside variants need geometry math) | line ~1 day each; pitchfork ~2 weeks |
| Fibonacci | retracement, extension, fan, arc, time zones, spiral, channel, wedge | ⚠️ GAP-easy on retracement + extension (we have retracement indicator form); ❌ GAP-hard on arc + spiral (vector math) | retracement ~2 days; arc ~1 week |
| Geometric | rectangle, ellipse, triangle, polygon, brush, path, curve | ⚠️ GAP-easy on rectangle + ellipse; ❌ GAP-hard on brush (input-tracked vector paths) | rect ~1 day; brush ~1 week |
| Annotation | text, callout, price label, note, comment, anchored text | ⚠️ GAP-easy | each ~1-2 days |
| Patterns | head & shoulders, triangle, flag, Gann box, Gann fan, Elliott wave (multiple) | ❌ GAP-hard on Gann + Elliott (semantic geometry); ⚠️ GAP-easy on H&S overlay | Gann ~3 weeks; H&S ~1 week |
| Forecasting | projection, forecast, anchored VWAP (we ship native) | ✅ SUPERSEDED on Anchored VWAP; ⚠️ GAP-easy on projection | — |

---

## 3 · Chart types

**TV ships ~12+ chart types.** We currently ship 5 transformer-based.

| Chart type | TV native? | Our status | Source |
|---|---|---|---|
| Candlestick | yes | ✅ SUPERSEDED | legacy candle renderer |
| Bar (OHLC) | yes | ✅ SUPERSEDED | legacy |
| Line | yes | ✅ SUPERSEDED | legacy |
| Area | yes | ✅ SUPERSEDED | legacy |
| Hollow candle | yes | ⚠️ GAP-easy — rendering variant | new flag in candle renderer |
| Heikin Ashi | yes | ✅ SUPERSEDED | `packages/core/src/chartTypes/heikinAshi.ts` |
| Renko (fixed) | yes | ✅ SUPERSEDED | `packages/core/src/chartTypes/renko.ts` |
| Renko (ATR) | yes | ✅ SUPERSEDED | same file, ATR-adaptive mode |
| Kagi | yes | ⚠️ GAP-easy — pattern is close to Renko | new |
| Point & Figure | yes | ✅ SUPERSEDED | `packages/core/src/chartTypes/pointAndFigure.ts` |
| Line Break | yes | ⚠️ GAP-easy | new |
| Range Bars | yes | ✅ SUPERSEDED | `packages/core/src/chartTypes/rangeBars.ts` |
| Volume Candles | TV Premium | ⚠️ GAP-easy — render variant | new flag in candle renderer |

---

## 4 · Pro / Premium platform features

| Feature | TV tier | Our status | Notes |
|---|---|---|---|
| Multi-chart layouts (1/2/4/6/8) | Pro+ | ⚠️ GAP-easy — adapter responsibility | demo app B-7 target |
| Bar Replay | Pro+ | ✅ SUPERSEDED — controller exists; UI is adapter | `packages/core/src/replay/` |
| Tick-level replay | TV not available | ✅ SUPERSEDED — controller supports it | replay controller `pacing: 'tick'` |
| Alerts (basic price/indicator) | Free + Pro tiers | ✅ SUPERSEDED — 10 predicate kinds | `packages/core/src/alerts/` |
| Alerts (drawing-line-cross) | Pro+ | ⚠️ GAP-easy — predicate kit extension | needs `drawing-line-cross` predicate (flagged by Alerts audit) |
| Alerts (server-side delivery) | Pro+ | ❌ GAP-hard — out of process | future |
| Strategy Tester / Backtester | Pro+ | ⚠️ GAP-easy — replay controller + position accounting | new module |
| Paper Trading | Pro | ⚠️ GAP-easy — same as Strategy Tester + UI | new module |
| Watchlist | All tiers | 🚫 OUT-OF-SCOPE — adapter / app layer concern | — |
| Symbol Search | All tiers | 🚫 OUT-OF-SCOPE — data layer responsibility | — |
| Stock Screener | Pro+ | 🚫 OUT-OF-SCOPE | — |
| News integration | Pro+ | 🚫 OUT-OF-SCOPE | — |
| Saved chart layouts (cross-device) | Pro+ | ⚠️ GAP-easy — `serialize/deserialize` already in ai-runtime | `packages/ai-runtime/src/serialization.ts` |

---

## 5 · Pine ecosystem (TV closed system)

| Capability | TV state | Our state | Strategy |
|---|---|---|---|
| Custom-indicator language | Pine Script v6 (Jan 2026) — closed, server-only | ✅ SUPERSEDED (TS path) — open, in-process. ❌ GAP-hard but planned (WASM path) — ROADMAP §4.2 | The TS path covers "in-app private indicators" today; WASM path is the "indicator market" play |
| Community script library | ~150k public scripts | ❌ GAP-hard — community-driven; bootstrap requires marketing | future |
| Strategy backtest engine | Pine bundled | ⚠️ GAP-easy — see Strategy Tester row above | — |
| Pine alerts | server-side | 🚫 OUT-OF-SCOPE (we focus on in-process alerts) | — |
| Pine `request.footprint` (Jan 2026) | data primitives | ✅ SUPERSEDED — full controller, not just data | `packages/core/src/components/footprint/` |
| Pine `request.volume_row` | data primitive | ✅ SUPERSEDED — `volumeProfile` controller exposes per-bucket data | `packages/core/src/components/volumeProfile/` |

---

## 6 · Architecture deltas (where we structurally beat TV)

| Delta | TV | Us | Evidence |
|---|---|---|---|
| Headless core (no DOM at module import) | not separable | ✅ — `@klinechart-quant/core` zero browser API at top level | `packages/core/src/render/SurfaceBackend.ts` contract |
| Framework adapters as first-class | TV ships React lib only, paid | ✅ — React + Vue + Angular all native, all open | 18 hooks × 3 frameworks |
| `Object.is` short-circuit signal layer | private signal impl | ✅ — `packages/core/src/reactivity/signal.ts` 80 LOC | 333k hz Object.is bench (`packages/core/src/__bench__/signal.bench.ts`) |
| AI Native command + describe + serialize | TV has none | ✅ — `@klinechart-quant/ai-runtime` ships 12 MCP tools + 4 describe fns + JSON round-trip | `packages/ai-runtime/` |
| Bench infrastructure | TV closed | ✅ — 14 benches with real numbers | `packages/core/src/__bench__/` |
| Origin-shift fp32 precision | unknown | ✅ — measured 1.14×10⁻¹³ logical px error / 1000-frame pan with 3× rebase reduction | `packages/core/src/scale/originShift.ts` + bench |
| WebGPU readiness | TV unknown | ✅ — Renderer abstraction landed; 5 WGSL compute spec docs in components | `packages/core/src/render/Renderer.ts` |
| 100% MIT/Apache code path | proprietary | ✅ — every package MIT | per-package LICENSE files |

---

## 7 · Triage summary

**Status counts (this matrix):**

| Status | Count | Examples |
|---|---|---|
| ✅ SUPERSEDED | 51 | 39 indicators + 5 chart types + 4 differentiating components + bar replay + ai-runtime + alerts engine |
| ⚠️ GAP-easy | 47 | ALMA/T3/ZLEMA/VIDYA/FRAMA/LSMA, Awesome/UO/DPO/Fisher/Schaff, std dev/BB%B/BBW/Choppiness/NATR, A/D Line/EOM, VP visible/session/period, ADX/ZigZag/LinReg, Z-Score/Correlation/Beta, drawings (line/ray/rect/text/H&S), chart types (hollow/Kagi/Line Break/Volume), MTF refinements, multi-chart, Strategy Tester / Paper Trading, saved layouts |
| ❌ GAP-hard | ~15 | Open Interest / Funding / Liquidations (datasource bound), pitchfork variants / Gann / Elliott (geometry), brush / arc / spiral (vector input), WASM indicator path, public script library bootstrap |
| 🚫 OUT-OF-SCOPE | ~6 | Watchlist, Symbol Search, Screener, News, Pine server-side alerts, real-time US equities (license-bound per ROADMAP §5.4) |

**Earned-evidence ratio**: 51 / (51 + 47 + 15) = **44%** of the in-scope feature space is SUPERSEDED today.

**Pack candidates** (each clusters to ~1 PR of ≤2 weeks):
- **Indicator pack A · MA family completion** — ALMA, T3, ZLEMA, VIDYA, FRAMA, LSMA (~6 indicators)
- **Indicator pack B · Oscillator completion** — Stoch RSI, AO, UO, DPO, Fisher, Schaff (~6 indicators)
- **Indicator pack C · Volatility completion** — std dev, BBW, %B, Choppiness, NATR (~5 indicators)
- **Indicator pack D · Volume completion** — A/D Line, EOM, BB%B, VP-variant-3 (~4 indicators)
- **Drawing pack A · primary lines + rects + text** — line/ray/extended/parallel-channel/rect/text/anchored-text (~7 drawings)
- **Drawing pack B · Fibonacci suite** — retracement + extension + fan + time zones (~4 drawings)
- **Chart type pack** — hollow candle + Kagi + Line Break + Volume Candles (~4 types)
- **Platform pack** — Strategy Tester + Paper Trading + Multi-chart layout + Saved layouts (~4 features)

Each pack lands as one focused PR with a coherent test suite. Total ~40 GAP-easy items closable in **≈8 PRs / ~10 weeks**.

---

## 8 · How to read / extend this matrix

- Every row cites either a TV source (`docs/tradingview-archive/` if locally indexed) or our own implementation file with line context where relevant.
- A row's status MUST NOT be silently upgraded to ✅ — promotion happens via a commit that lands the supersession evidence, then a tick updates this matrix as the RECORD step.
- New TV features (Pine release notes, charting library changelog) are recorded as new rows with status ❌ or 🚫 by default; promotion to ⚠️ or ✅ follows the same rule.
- This matrix is the source of truth for 组件完整性 dimension scoring in `LOOP_LEDGER.md`.
