# Competitive Analysis: `@klinechart-quant` vs TradingView (Premium tier, 2026)

> **Audience**: CTO, rendering lead (author), product/model lead, AI coding agents.
> **Purpose**: Map every shipping TradingView capability against `KLineChartQuant`'s current state, classify each as SUPERSEDED / GAP-easy / GAP-hard / OUT-OF-SCOPE, and decide where we plant flags.
> **Scope**: Capability-level only. Pricing, business model, and broker economics are tangential and noted only where they explain a gating decision.
> **Methodology**: Citations are direct WebFetch reads of `tradingview.com` (docs, pricing, blog, Pine Script release notes). Internal claims cite absolute paths in `src/`. Done 2026-05-29.

Legend: ✅ matched / exceeded · ⚠️ partial · ❌ missing · 🚫 deliberately out-of-scope

---

## 0. Headline numbers (TradingView, May 2026)

The marketing surface to beat, with sources.

| Surface | TradingView shipping today | Source |
|---|---|---|
| Built-in indicators & strategies | **400+** | [tradingview.com/features/](https://www.tradingview.com/features/) |
| Drawing tools | **110+ smart drawing tools** | [tradingview.com/features/](https://www.tradingview.com/features/) |
| Chart types | **21+** (incl. Heikin Ashi, Renko, Kagi, P&F, Line Break, Range) | [tradingview.com/features/](https://www.tradingview.com/features/) |
| Max charts per tab | **16** (Ultimate) / 8 (Premium) / 4 (Plus) / 2 (Essential) | [tradingview.com/pricing/](https://www.tradingview.com/pricing/) |
| Max indicators per chart | **50** (Ultimate) / 25 (Premium) / 10 (Plus) / 5 (Essential) | [tradingview.com/pricing/](https://www.tradingview.com/pricing/) |
| Active alerts | 1000 (Ultimate) / 400 (Premium) / 100 (Plus) / 20 (Essential) | [tradingview.com/pricing/](https://www.tradingview.com/pricing/) |
| Bar Replay speeds | **9** | [tradingview.com/features/](https://www.tradingview.com/features/) |
| Pine Script Community Scripts | **>150,000** (half open-source) | [tradingview.com/pine-script-docs/welcome/](https://www.tradingview.com/pine-script-docs/welcome/) |
| Broker integrations | **100+** | [tradingview.com/features/](https://www.tradingview.com/features/) |
| Screeners | **6** across stocks/ETFs/bonds/crypto, 400+ filters, 70+ exchanges | [tradingview.com/features/](https://www.tradingview.com/features/) |
| Pine Script latest version | **v6** (Nov 2024), with `footprint` requests added **Jan 2026** | [pine-script-docs/release-notes/](https://www.tradingview.com/pine-script-docs/release-notes/) |

Our headline today: **~30 indicators**, **12 drawing primitives**, **1 chart type** (candlestick), single chart, **WebGL** renderer (no WebGPU yet), no alerts/replay/screener, no Pine-equivalent runtime.

---

## 1. Indicators

TradingView markets "400+ built-in indicators and strategies" ([tradingview.com/features/](https://www.tradingview.com/features/)). That number folds in Pine-defined strategies, candle pattern recognition, and ~150–200 distinct quantitative indicators. Below we enumerate the categories that any professional charting library has to ship.

Our catalog of record: `src/semantic/types.ts:79-134` (SubIndicatorParams type union — currently 33 sub-pane indicator slots) and `src/core/indicators/calculators.ts` (one `calc*Data` and `calc*DataSoA` pair per indicator, ~30 implemented).

### 1.1 Moving averages

TradingView ships 15+ MA flavours (SMA, EMA, WMA, DEMA, TEMA, HMA, KAMA, ALMA, T3, ZLEMA, VWMA, SMMA/RMA, FRAMA, McGinley Dynamic, LWMA).

| Indicator | TradingView | Ours | File pointer | Gap |
|---|---|---|---|---|
| SMA / MA | ✅ | ✅ | `src/core/indicators/maState.ts`, `calculators.ts:241` | SUPERSEDED |
| EMA / EXPMA | ✅ | ✅ | `src/core/indicators/expmaState.ts`, `calculators.ts:129` | SUPERSEDED |
| WMA | ✅ | ✅ | `src/core/indicators/wmaState.ts`, `calculators.ts:1095` | SUPERSEDED |
| DEMA | ✅ | ✅ | `src/core/indicators/demaState.ts`, `calculators.ts:1144` | SUPERSEDED |
| TEMA | ✅ | ✅ | `src/core/indicators/temaState.ts`, `calculators.ts:1177` | SUPERSEDED |
| HMA | ✅ | ✅ | `src/core/indicators/hmaState.ts`, `calculators.ts:1213` | SUPERSEDED |
| KAMA | ✅ | ✅ | `src/core/indicators/kamaState.ts`, `calculators.ts:1255` | SUPERSEDED |
| ALMA (Arnaud Legoux MA) | ✅ | ❌ | — | GAP — easy (≤1 wk, 1 PR) |
| T3 (Tillson) | ✅ | ❌ | — | GAP — easy (≤1 wk, 1 PR) |
| ZLEMA (Zero-Lag EMA) | ✅ | ❌ | — | GAP — easy (≤1 wk, 1 PR) |
| VWMA (Volume-weighted MA) | ✅ | ⚠️ (we have VWAP but not VWMA) | `vwapState.ts` exists, VWMA missing | GAP — easy (~3 days) |
| SMMA / RMA (Wilder smoothing) | ✅ | ❌ | — | GAP — easy (~2 days) |
| FRAMA, McGinley Dynamic | ✅ | ❌ | — | GAP — easy (~1 wk together) |

**Subtotal**: 7 matched, 6–7 easy gaps. One Phase-1.5 PR cluster ("MA expansion pack", 2–3 weeks) closes the entire MA category.

### 1.2 Oscillators

| Indicator | TradingView | Ours | File pointer | Gap |
|---|---|---|---|---|
| RSI | ✅ | ✅ | `src/core/indicators/rsiState.ts`, `calculators.ts:292` | SUPERSEDED |
| Stochastic (KD) | ✅ | ✅ | `src/core/indicators/stochState.ts`, `calculators.ts:408` | SUPERSEDED |
| MACD | ✅ | ✅ | `src/core/indicators/macdState.ts`, `calculators.ts:741` | SUPERSEDED |
| CCI | ✅ | ✅ | `src/core/indicators/cciState.ts`, `calculators.ts:356` | SUPERSEDED |
| Williams %R (WMSR) | ✅ | ✅ | `src/core/indicators/wmsrState.ts`, `calculators.ts:487` | SUPERSEDED |
| ROC | ✅ | ✅ | `src/core/indicators/rocState.ts`, `calculators.ts:1655` | SUPERSEDED |
| Momentum (MOM) | ✅ | ✅ | `src/core/indicators/momState.ts`, `calculators.ts:464` | SUPERSEDED |
| KST (Know Sure Thing) | ✅ | ✅ | `src/core/indicators/kstState.ts`, `calculators.ts:576` | SUPERSEDED |
| TRIX | ✅ | ✅ | `src/core/indicators/trixState.ts`, `calculators.ts:1687` | SUPERSEDED |
| Awesome Oscillator (AO) | ✅ | ❌ | — | GAP — easy (~2 days) |
| Stochastic RSI | ✅ | ⚠️ (RSI + Stoch separately) | combine in 1 PR | GAP — easy (~2 days) |
| Ultimate Oscillator | ✅ | ❌ | — | GAP — easy (~3 days) |
| DPO (Detrended Price Oscillator) | ✅ | ❌ | — | GAP — easy (~2 days) |

**Subtotal**: 9 matched, 4 easy gaps. "Oscillator completion" PR, 1–2 weeks.

### 1.3 Volatility

| Indicator | TradingView | Ours | File pointer | Gap |
|---|---|---|---|---|
| Bollinger Bands (BOLL) | ✅ | ✅ | `src/core/indicators/bollState.ts`, `calculators.ts:45` | SUPERSEDED |
| ATR | ✅ | ✅ | `src/core/indicators/atrState.ts`, `calculators.ts:996` | SUPERSEDED |
| Keltner Channel | ✅ | ✅ | `src/core/indicators/keltnerState.ts`, `calculators.ts:1474` | SUPERSEDED |
| Donchian Channel | ✅ | ✅ | `src/core/indicators/donchianState.ts`, `calculators.ts:1525` | SUPERSEDED |
| Historical Volatility (HV) | ✅ | ✅ | `src/core/indicators/hvState.ts`, `calculators.ts:1737` | SUPERSEDED |
| Parkinson Volatility | ❌ (not native; community Pine) | ✅ | `src/core/indicators/parkinsonState.ts`, `calculators.ts:1788` | **EXCEEDED** (we ship native, TV needs custom Pine) |
| Standard Deviation | ✅ | ⚠️ (BOLL exposes it internally) | trivial wrapper | GAP — easy (~1 day) |
| Choppiness Index | ✅ | ❌ | — | GAP — easy (~3 days) |
| BB %B and BB Width | ✅ | ❌ | extend BOLL | GAP — easy (~2 days) |

**Subtotal**: 6 matched, 1 exceeded, 3 easy gaps.

### 1.4 Volume

| Indicator | TradingView | Ours | File pointer | Gap |
|---|---|---|---|---|
| OBV | ✅ | ✅ | `src/core/indicators/obvState.ts`, `calculators.ts:1903` | SUPERSEDED |
| PVT (Price Volume Trend) | ✅ | ✅ | `src/core/indicators/pvtState.ts`, `calculators.ts:1929` | SUPERSEDED |
| VWAP | ✅ | ✅ | `src/core/indicators/vwapState.ts`, `calculators.ts:1962` | SUPERSEDED |
| CMF (Chaikin Money Flow) | ✅ | ✅ | `src/core/indicators/cmfState.ts`, `calculators.ts:2007` | SUPERSEDED |
| MFI (Money Flow Index) | ✅ | ✅ | `src/core/indicators/mfiState.ts`, `calculators.ts:2050` | SUPERSEDED |
| Chaikin Volatility | ✅ | ✅ | `src/core/indicators/chaikinVolState.ts`, `calculators.ts:1838` | SUPERSEDED |
| VMA (Volume MA) | ✅ | ✅ | `src/core/indicators/vmaState.ts`, `calculators.ts:1877` | SUPERSEDED |
| Accumulation/Distribution Line (A/D) | ✅ | ❌ | — | GAP — easy (~2 days) |
| Anchored VWAP | ✅ | ⚠️ (VWAP w/ sessionGap, no user anchor) | needs UI anchor + recalc | GAP — easy (~1 wk; needs drawing-tool hook) |
| Ease of Movement (EMV) | ✅ | ❌ | — | GAP — easy (~2 days) |
| Volume Oscillator | ✅ | ❌ | — | GAP — easy (~2 days) |

**Subtotal**: 7 matched, 4 easy gaps. Anchored VWAP is the highest-leverage one (popular among institutional traders, requires coupling indicator + drawing system — touches `src/core/drawing/index.ts` and VWAP state).

### 1.5 Trend

| Indicator | TradingView | Ours | File pointer | Gap |
|---|---|---|---|---|
| Parabolic SAR | ✅ | ✅ | `src/core/indicators/sarState.ts`, `calculators.ts:1325` | SUPERSEDED |
| Ichimoku Cloud | ✅ | ✅ | `src/core/indicators/ichimokuState.ts`, `calculators.ts:1595` | SUPERSEDED (and we ship fix for SpanA/B cloud gaps — commit `38bf133`) |
| SuperTrend | ✅ | ✅ | `src/core/indicators/supertrendState.ts`, `calculators.ts:1406` | SUPERSEDED |
| ADX / DI+ / DI− | ✅ | ❌ | — | GAP — easy (~1 wk, classic Wilder formulas) |
| Aroon Up/Down | ✅ | ❌ | — | GAP — easy (~3 days) |
| Vortex Indicator | ✅ | ❌ | — | GAP — easy (~3 days) |
| TTM Squeeze | ✅ | ❌ | — | GAP — easy (~3 days, composite BB + KC) |

**Subtotal**: 3 matched, 4 easy gaps. ADX is the most-requested missing trend indicator.

### 1.6 Market structure & S/R

| Tool | TradingView | Ours | File pointer | Gap |
|---|---|---|---|---|
| Pivot Points (Traditional/Fib/Woodie/Camarilla/DM) | ✅ ([support/solutions/43000521824](https://www.tradingview.com/support/solutions/43000521824-indicators-metrics/)) | ⚠️ (Traditional only) | `src/core/indicators/pivotState.ts`, `calculators.ts:2117` | GAP — easy (~1 wk, +4 variants) |
| Fibonacci levels | ✅ | ✅ (retracement only as indicator) | `src/core/indicators/fibState.ts`, `calculators.ts:2163` | SUPERSEDED for retracement; extension/fan/arc/time-zones are **drawing tools** (see §2) |
| SMC swing / BOS / CHOCH | ❌ (third-party Pine only) | ✅ | `src/core/indicators/structureState.ts`, `calculators.ts:2240` | **EXCEEDED** (native; TV requires paid community scripts) |
| FVG / Order Blocks (SMC zones) | ❌ (third-party Pine) | ✅ | `src/core/indicators/zonesState.ts`, `calculators.ts:2383` | **EXCEEDED** |
| Andrews' Pitchfork | ✅ | ❌ | — | GAP — hard (drawing tool with anchored math; ~2 wks) |

**Subtotal**: SMC structure + zones is one of our genuine moats — TradingView users pay $30–60/mo to Mentfx, LuxAlgo etc. for what we ship MIT-licensed in core.

### 1.7 Order flow / advanced

This is the rough edge of TradingView's offering and our intended differentiation zone (ROADMAP.md §3).

| Tool | TradingView | Ours | File pointer | Gap |
|---|---|---|---|---|
| Volume Profile (Session, Fixed, Visible, Anchored, Periodic, HD — 6 variants) | ✅ ([solutions/43000502040](https://www.tradingview.com/support/solutions/43000502040-volume-profile/)) | ⚠️ (1 variant: visible range with POC/VAH/VAL) | `src/core/indicators/volumeProfileState.ts`, `calculators.ts:2496` | GAP — easy for Fixed Range + Session (~2 wks); HD/Periodic are GAP-hard |
| Cumulative Volume Delta (CVD) | ✅ | ❌ | — | GAP — easy (~1 wk) if trade-direction available; depends on data layer (see §6) |
| Open Interest | ✅ | ❌ | — | GAP — easy (~3 days) once data feed has OI |
| Funding Rate | ✅ (crypto symbols) | ❌ | — | GAP — easy (~3 days) once data layer ships |
| Liquidations | ⚠️ (community Pine, not native) | ❌ | — | GAP — easy (~1 wk); we can match this trivially |
| Footprint Chart | ⚠️ (Pine v6 `footprint` request added Jan 2026 — [release-notes](https://www.tradingview.com/pine-script-docs/release-notes/); chart rendering still community-only) | ❌ (planned P1) | — | GAP — hard (4–8 wks; ROADMAP §3.3). **This is a strategic moat** — TV exposes the data, not the visualization. |
| Order Book Heatmap (Bookmap-style) | ❌ | ❌ (planned P1) | — | GAP — hard (6–10 wks; ROADMAP §3.2). **Strategic moat** — TV does not ship this at all. |
| Depth Chart | ⚠️ (no native; community widgets only) | ❌ (planned P1, ROADMAP §3.4) | — | GAP — easy once order book layer exists |

**Subtotal**: This is where the roadmap's three differentiation components (§3.1–3.3) live. TV's January-2026 Pine v6 footprint request is a **partial concession** of the gap, not a closure — they ship the data hooks for Pine to crunch, but not a polished native footprint chart UI.

### 1.8 Statistical

| Indicator | TradingView | Ours | Gap |
|---|---|---|---|
| Z-Score | ✅ (Pine standard library) | ❌ | GAP — easy (~2 days) |
| Linear Regression Line/Channel | ✅ | ⚠️ (drawing tool: `createRegressionChannelDefinition` in `src/core/drawing/index.ts:648`) | SUPERSEDED for channel; standalone indicator GAP-easy (~2 days) |
| Correlation Coefficient | ✅ | ❌ | GAP — easy (~3 days) |
| Rate of Change | ✅ | ✅ (= ROC, §1.2) | SUPERSEDED |
| Beta | ✅ | ❌ | GAP — easy (~3 days) |

**Subtotal**: ~5 easy adds, one Phase-1.5 PR.

### 1.9 Indicator totals

| Bucket | Count |
|---|---|
| TradingView claim | 400+ |
| Realistic distinct quantitative indicators (excluding strategies + candle patterns) | ~150–200 |
| **Ours shipping** | **~30** (every `calc*Data` in `calculators.ts` + the 33 sub-pane types in `src/semantic/types.ts:79-134`) |
| **GAP-easy adds (this analysis)** | **~30** indicators across §1.1–§1.8 |

Closing the indicator gap to "feature parity at the >90% percentile" is roughly **10 weeks** of disciplined PRs by one engineer. Closing the long tail to literally 400 is not a goal — most of those are candle-pattern detectors and Pine strategies, both of which we attack structurally (P2 plugin system) rather than 1-by-1.

---

## 2. Drawing tools

TradingView: **110+ smart drawing tools** ([tradingview.com/features/](https://www.tradingview.com/features/)).

Our catalog of record: `src/core/drawing/index.ts:638-651` `registerDefaultDrawingDefinitions()` registers **12** kinds, declared as `DrawingKind` union in `src/plugin/types.ts:314-326`.

### 2.1 Trend lines & channels

| Tool | TV | Ours | File | Gap |
|---|---|---|---|---|
| Trend line (segment) | ✅ | ✅ | `src/core/drawing/index.ts:639` | SUPERSEDED |
| Ray | ✅ | ✅ | `index.ts:640` | SUPERSEDED |
| Extended line | ✅ | ✅ | `index.ts:641` | SUPERSEDED |
| Horizontal line / ray | ✅ | ✅ | `index.ts:642-643` | SUPERSEDED |
| Vertical line | ✅ | ✅ | `index.ts:644` | SUPERSEDED |
| Cross line | ✅ | ✅ | `index.ts:645` | SUPERSEDED |
| Parallel channel | ✅ | ✅ | `index.ts:647` | SUPERSEDED |
| Regression channel | ✅ | ✅ | `index.ts:648` | SUPERSEDED |
| Flat-top / -bottom (smooth top/bottom) | ✅ | ✅ | `index.ts:649` | SUPERSEDED |
| Disjoint channel | ✅ | ✅ | `index.ts:650` | SUPERSEDED |
| Arrow / Trend line with arrow | ✅ | ❌ | — | GAP — easy (~2 days, variant of trend-line) |
| Pitchfork (Schiff, Modified Schiff, Inside) | ✅ | ❌ | — | GAP — hard (~3 wks; three anchor points + median-line math) |

**Subtotal**: We match 10/12 trend-line tools — actually solid coverage. Pitchfork is the structural gap.

### 2.2 Fibonacci tools

| Tool | TV | Ours | Gap |
|---|---|---|---|
| Retracement | ✅ | ⚠️ (only as indicator, not as drawing) | GAP — easy (~1 wk; need anchored drawing definition) |
| Extension | ✅ | ❌ | GAP — easy (~3 days) |
| Fan | ✅ | ❌ | GAP — easy (~3 days) |
| Arc | ✅ | ❌ | GAP — easy (~3 days) |
| Time Zones | ✅ | ❌ | GAP — easy (~3 days) |
| Channel | ✅ | ❌ | GAP — easy (~3 days) |
| Speed Resistance Fan | ✅ | ❌ | GAP — easy (~3 days) |
| Spiral | ✅ | ❌ | GAP — hard (logarithmic-spiral math) |
| Wedge / Trend-based Fib Time / Extension | ✅ | ❌ | GAP — easy each (~2 days) |

**Subtotal**: One **"Fibonacci pack" PR** (2–3 wks) closes 8/9 — high-leverage single deliverable.

### 2.3 Geometric shapes & annotation

| Tool | TV | Ours | Gap |
|---|---|---|---|
| Rectangle | ✅ | ✅ (area primitive exists, `src/plugin/types.ts:370`) | ⚠️ as primitive only — needs user-facing tool registration |
| Ellipse | ✅ | ❌ | GAP — easy (~2 days) |
| Triangle / Polygon | ✅ | ❌ | GAP — easy (~3 days each) |
| Curve / Brush | ✅ | ❌ | GAP — easy (~3 days) |
| Text / Note / Callout | ✅ | ⚠️ (text primitive exists, no user tool) | GAP — easy (~3 days) |
| Price label / Anchored note | ✅ | ❌ | GAP — easy (~3 days) |
| Sticky note / Comment | ✅ | ❌ | GAP — easy (~2 days) |
| Emoji / Sign | ✅ | ❌ | GAP — easy (~1 day) |

**Subtotal**: ~10 days for the entire annotation suite — none of it is technically hard, just hasn't been prioritized.

### 2.4 Patterns

| Tool | TV | Ours | Gap |
|---|---|---|---|
| Head & Shoulders | ✅ | ❌ | GAP — easy (~3 days; multi-anchor primitive) |
| Triangle / Wedge / Flag | ✅ | ❌ | GAP — easy each (~2 days) |
| ABCD / Elliott Wave (3, 5, 12, triangle) | ✅ | ❌ | GAP — hard (Elliott rules + nested wave validation, ~3 wks) |
| Gann Box / Square / Fan | ✅ | ❌ | GAP — hard (Gann math, ~3 wks) |
| Cypher / Bat / Crab / Gartley harmonic | ✅ | ❌ | GAP — hard (harmonic Fib ratios + pattern detection, ~3 wks) |

**Subtotal**: Manual pattern tools easy; Elliott + Gann + Harmonics together are a hard quarter.

### 2.5 Forecasting

| Tool | TV | Ours | Gap |
|---|---|---|---|
| Projection (long/short position) | ✅ | ❌ | GAP — easy (~1 wk; risk-reward box with entry/SL/TP) |
| Anchored VWAP (drawing variant) | ✅ | ❌ | GAP — easy (~1 wk; couples §1.4 + drawing) |
| Forecast price | ✅ | ❌ | GAP — easy (~3 days) |
| Date range / Price range | ✅ | ❌ | GAP — easy (~3 days) |

**Subtotal**: "Position projection" is the most-requested missing tool for retail traders. ~3 wks for the whole forecasting category.

### 2.6 Drawing tools totals

| Bucket | Count |
|---|---|
| TradingView claim | 110+ |
| Ours shipping | **12** (`src/core/drawing/index.ts:638-651`) |
| GAP-easy adds (this analysis) | ~35 |
| GAP-hard adds | ~5 (Pitchfork, Elliott, Gann, Harmonics, Fib Spiral) |

A realistic "feature-parity at 70th percentile" target = 50 drawing tools = ~8 weeks of dedicated work + a generalised anchored-primitive system (which 80% of these need).

---

## 3. Chart types

TradingView: **21+ chart types** ([tradingview.com/features/](https://www.tradingview.com/features/)). Intraday Renko, Kagi, P&F, Line Break, custom Range Bars all gated to **paid tiers** ([tradingview.com/pricing/](https://www.tradingview.com/pricing/)).

| Chart type | TV | Ours | File pointer | Gap |
|---|---|---|---|---|
| Candlestick | ✅ | ✅ | `src/core/renderers/candle.ts`, `src/core/renderers/webgl/candleSurface.ts` (WebGL accelerated) | SUPERSEDED |
| Bar (OHLC) | ✅ | ❌ | — | GAP — easy (~1 wk; same data, simpler geom) |
| Line | ✅ | ❌ | — | GAP — easy (~2 days) |
| Area | ✅ | ❌ | — | GAP — easy (~2 days) |
| Baseline | ✅ | ❌ | — | GAP — easy (~2 days) |
| Hollow Candle | ✅ | ❌ | — | GAP — easy (~3 days; candle shader variant) |
| Heikin Ashi | ✅ | ❌ | — | GAP — easy (~1 wk; OHLC transform + candle render) |
| Renko | ✅ | ❌ | — | GAP — hard (~3 wks; time-discontinuous bar generator + reflows everything in §1 of ROADMAP about bar-index axis) |
| Kagi | ✅ | ❌ | — | GAP — hard (~3 wks; same reasons as Renko) |
| Line Break | ✅ | ❌ | — | GAP — hard (~2 wks) |
| Point & Figure | ✅ | ❌ | — | GAP — hard (~4 wks; box-size + reversal logic) |
| Range Bars | ✅ | ❌ | — | GAP — hard (~3 wks; price-driven bars, not time) |
| Volume Profile variants (Session/Fixed/Visible) | ✅ | ⚠️ (Visible only) | `volumeProfileState.ts` | covered in §1.7 |
| Footprint Cluster / Profile | ⚠️ (Pine v6 footprint requests, no native chart) | ❌ (P1 planned) | — | GAP — hard, **strategic moat** (covered in §1.7) |
| Tick chart | ✅ | ❌ | — | GAP — hard (~2 wks; needs tick data stream) |
| Range candles, Tick imbalance bars | ✅ (Premium) | ❌ | — | GAP — hard |

**Note on Renko/Kagi/P&F**: These chart types are price-event-driven, not time-driven. They violate the bar-index-as-X-axis assumption in ROADMAP §1.1 — they need a separate time-aware mode in `src/core/scale/` (currently only `TimeScale` over bar-index). This is a **structural change**, not a renderer addition. **Strategic decision needed**: do we ship these in 2026, or is "candlestick + bar + line/area + Heikin Ashi" enough for v1.0?

**Recommendation**: Ship the trivial five (Bar/Line/Area/Baseline/Hollow/Heikin) as one PR cluster (~3 wks total). Defer event-driven types (Renko/Kagi/P&F/Range/Line-Break) to a single Phase-1.75 "alt-chart" milestone behind a flag — they're high-effort and have a small, sticky audience that TV already serves well.

---

## 4. Pro / Premium platform features (the "is it just a chart, or a workstation?" question)

TradingView's pricing tiers gate workstation features. We need a position on each — **gate, ship, or skip**.

### 4.1 Multi-chart layouts

- **TV**: 2 / 4 / 8 / 16 charts per tab across Essential / Plus / Premium / Ultimate ([tradingview.com/pricing/](https://www.tradingview.com/pricing/))
- **Ours**: 1 chart per `<KLineChart />` instance. The component composes — apps can render multiple instances side-by-side — but there's no sync (crosshair, scroll, symbol) across instances.
- **Gap**: ⚠️ partial. The composability is there; sync isn't.
- **Classification**: **GAP — easy** (~2 wks for crosshair/scroll/symbol sync via a `LinkedChartGroup` API) for the syncing; layout is the user's responsibility (it's a component, not a workstation). The wider workstation concern is **OUT-OF-SCOPE** — we ship the brick, the user builds the wall.

### 4.2 Bar Replay / Playback

- **TV**: 9 speeds, intraday + daily, all paid tiers ([tradingview.com/features/](https://www.tradingview.com/features/))
- **Ours**: ❌ none. No replay state in `src/core/`.
- **Gap classification**: **GAP — hard** (~4 wks; needs a `ReplayController` in `src/core/controller/`, a virtual time cursor in `TimeScale`, and indicator state-rollback semantics — `src/core/indicators/scheduler.ts` calculates everything streaming forward).
- **Strategic value**: HIGH. Replay is the killer feature for backtesting visualization and education. Pairs perfectly with our planned WebGPU renderer (ROADMAP §2.4 LOD) since fast scrubbing through a million ticks is exactly where WebGL hits a wall.
- **Suggested mapping**: P1.5 deliverable. Should ship alongside WebGPU.

### 4.3 Alerts

- **TV**: 20→1000 active alerts; price, drawing, indicator, Pine-condition; webhook, mobile, browser delivery ([tradingview.com/features/](https://www.tradingview.com/features/))
- **Ours**: ❌ none.
- **Gap classification**: **GAP — hard** (~6 wks for engine; *infinite* for delivery infrastructure — that's a server problem, not a chart problem).
- **Decision**: Ship a **client-side alert engine** (price-crosses-line, indicator-crosses-threshold) as a P3-tier component. Webhooks/push notifications are **OUT-OF-SCOPE** — that's broker/server territory.
- **Mapping**: P3 (after data layer ships in ROADMAP §5; alerts need historical state).

### 4.4 Watchlist + Screener

- **TV**: 6 screeners, 400+ filters, 70+ exchanges
- **Ours**: ❌ none, and **explicitly not on the roadmap**.
- **Gap classification**: 🚫 **OUT-OF-SCOPE**. We are a chart component library; screeners are a vertical product. Building one requires:
  1. A symbol database (licensing + maintenance overhead)
  2. A query engine across thousands of symbols (we'd need to ship the DuckDB-WASM layer from ROADMAP §5.2 first)
  3. Fundamental data feeds (licensing wall — see ROADMAP §5.4)
- **Recommendation**: Embed integration story is *"plug our chart into your screener"*. Don't compete with TV's screener — compete on letting institutions build proprietary screeners and viz the result in our chart.

### 4.5 Strategy Tester / Backtest engine

- **TV**: Pine-driven backtest engine, equity curve, trade list, drawdown analysis. Bugs and quirks well-known to professional users (intra-bar logic, slippage modeling, look-ahead bias).
- **Ours**: ❌ none.
- **Gap classification**: **GAP — hard** (~8–12 wks for a credible engine), but the value prop is huge because Pine's engine has known issues.
- **Strategic question**: Backtesting is downstream of the **WASM indicator** path in ROADMAP §4.2. Once WASM indicators ship, a strategy is just an indicator that emits buy/sell signals + an engine that simulates execution against the OHLC stream. The engine is ~3 wks; the harder problem is signal-strategy ergonomics.
- **Mapping**: P2.5 (after WASM ABI stabilizes).

### 4.6 Paper Trading / Broker integration

- **TV**: Paper trading + 100+ brokers
- **Ours**: ❌ none.
- **Gap classification**: 🚫 **OUT-OF-SCOPE** for brokers (regulatory licensing wall per broker, integrations are perpetual maintenance). **Paper trading** is GAP-hard (~4 wks) and IS in scope as a P3.5 deliverable once data + strategy testers exist.

### 4.7 Custom timeframes

- **TV**: 7m, 23m, 4D etc. allowed on paid tiers ([tradingview.com/pricing/](https://www.tradingview.com/pricing/))
- **Ours**: Timeframe is whatever data source provides. We don't resample.
- **Gap classification**: **GAP — easy** (~1 wk for client-side resampling from 1-minute base). Should be a `chart.setTimeframe('7m')` call that bucket-aggregates the input data.
- **Mapping**: P3 (resampling is cleaner once data is Arrow-native).

### 4.8 Extended hours data

- **TV**: Premium tier unlock for pre/post-market data display
- **Ours**: We render whatever the data source sends. Visualizing extended-hours-marked bars (greyed background, dashed split) is unimplemented.
- **Gap classification**: **GAP — easy** (~1 wk; needs a `session` flag on bars + a background-shading layer in `src/core/renderers/`).

### 4.9 Multi-timeframe overlay

- **TV**: Show daily MA on a 1-hour chart (cross-timeframe indicator request)
- **Ours**: ❌. Our indicator runtime (`src/core/indicators/scheduler.ts`) assumes one timeframe per pane.
- **Gap classification**: **GAP — hard** (~4 wks; needs cross-timeframe data alignment in indicator state + UI for picking source TF). Pine v6 added `request.security()` with dynamic context for exactly this — it's a known-hard problem.
- **Mapping**: P3 (data layer prerequisite).

### 4.10 Synced charts

Covered in §4.1.

---

## 5. Pine Script ecosystem

### 5.1 Language

- **TV (May 2026)**: Pine Script **v6**, released Nov 2024. Highlights since 2024 ([release-notes](https://www.tradingview.com/pine-script-docs/release-notes/)):
  - Strict bool typing, short-circuit evaluation
  - **Dynamic `request.*()`** with series-string args (changes context per-bar)
  - Negative-index array access
  - **Maps** (key-value) collections
  - UDT sorting via `array.sort(sort_field=...)` (Apr 2026)
  - **Footprint requests** (`footprint`, `volume_row` objects with buy/sell volumes + POC data) — **Jan 2026**
  - `syminfo.isin`, `bid`/`ask` real-time variables, multiline strings (`"""..."""`)
- **Community library size**: **>150,000 Community Scripts**, ~half open-source ([pine-script-docs/welcome](https://www.tradingview.com/pine-script-docs/welcome/))
- **Backtest engine**: Now handles >9,000 trades without halting (v6 change). Well-known issues remain around realistic slippage modeling and intra-bar execution.

### 5.2 Our position

- **Ours**: No DSL. Indicators are TS objects implementing the stateful contract in `src/core/indicators/indicatorRuntime.ts`. Documented in `docs/CONTRIBUTING_INDICATOR.md`.
- **Roadmap position**: ROADMAP §4 — *Pluggable Indicator Runtime*. Two paths planned:
  1. **TS/JS indicators**: low-friction, in-process. Already mostly in place.
  2. **WASM indicators** (Rust / AssemblyScript): the "attack Pine's lockdown" play. Compile once, run anywhere, sandboxed, signable. ROADMAP §4.2.
- **Gap classification**:
  - Language: **GAP — hard** (~3 months for WASM ABI + tooling + a starter SDK; ROADMAP §4.2)
  - Community size: **GAP — strategic, structural**. 150K Pine scripts vs our zero is a community-network problem, not an engineering one. Solution: open-source the indicator collection, ship a registry, court the Pine-ports-to-our-format community.

**The non-obvious strategic insight**: Pine's value is the language + the community, not the language itself. We don't have to match Pine syntactically. **We have to make porting a Pine script to TS/WASM feel like 30 minutes of work**. The ROADMAP §4 stance — sandbox-safe WASM with stable simple ABI + a TS escape hatch for internal users — is exactly that bet.

### 5.3 Strategy library

TradingView's strategies are Pine-built strategies indexed in TV's Community Scripts. We have zero equivalent.

- **Gap classification**: **OUT-OF-SCOPE for v1**, then revisit after WASM indicators ship — the strategy-library question becomes "do we host a registry?" not "do we build strategies."

---

## 6. Architecture-level deltas (where the codebase quietly wins or loses)

These aren't features — they're shapes that determine *future* feature velocity.

| Dimension | TradingView | Ours | Gap classification |
|---|---|---|---|
| Renderer backend | Proprietary canvas; rumoured WebGL prototypes never publicly shipped | WebGL today (`src/core/renderers/webgl/candleSurface.ts`); **WebGPU planned P1** (ROADMAP §2) | ⚠️ on parity today, **strategic win expected** post-P1 |
| Indicator pipeline | Pine VM, server-side compile | Stateless `Calculator → Scheduler → StateStore → Renderer` (commit `6e64932`); local, debuggable | ✅ ours is more open |
| Data format | Proprietary | Will be Apache Arrow (ROADMAP §5.1); enables zero-copy GPU upload | ⚠️ today; ✅ planned |
| SQL on history | None | Will ship DuckDB-WASM (ROADMAP §5.2) | ✅ planned moat |
| AI / LLM control | None | Already shipped: command-bus, semantic config (`src/semantic/controller.ts`), Agent-first (README L18, L30) | ✅ ahead today |
| Multi-framework parity | TV widget = iframe with no real framework story | Native React / Vue / Angular adapters (`packages/{react,vue,angular}/`), monorepo ([commit `91b556c`]) | ✅ structurally ahead |
| SSR | TV widget = client-only iframe | SSR smoke tests for Next.js / Nuxt / Angular Universal ([commit `b69f29a`]) | ✅ ahead |
| License | Closed source | MIT — `LICENSE`, README L13 | ✅ open vs closed |

---

## 7. Strategic synthesis

### 7.1 Three things we already match or exceed

1. **SMC / order-flow structure indicators are native, MIT-licensed.** TV users pay $30–60/mo to LuxAlgo, Mentfx and similar for the FVG / Order Block / BOS / CHOCH stack we ship in `src/core/indicators/{structureState,zonesState}.ts`. This is the cheapest competitive moat we already own. Marketing should be loud about it.
2. **WebGL-accelerated candles at 190–200fps on 200Hz displays, 2ms frame generation** (README L34–35, commits `09e97f1` and `5e48d28`). TV doesn't publicly publish framerate numbers because they're not competitive at high refresh rates — our perf is documentably above TradingView's web client.
3. **Agent-first / semantic-config control surface** is shipping (`src/semantic/controller.ts`, README L18, L30). TV has no equivalent — their charts cannot be driven by an LLM directly because the UI is locked behind their proprietary iframe widget. This is exactly the wedge ROADMAP §6 (P4) is built around, and we already have a baseline implementation.

### 7.2 Three highest-leverage GAP-easy items (top wins, low cost)

1. **"MA expansion pack" + Oscillator + Volatility + Volume completion** — one focused 4-week sprint adds ~20 indicators (ALMA, T3, ZLEMA, VWMA, SMMA, AO, Stoch-RSI, Ultimate, DPO, Std-Dev, Choppiness, BB%B, A/D Line, Anchored VWAP, EMV, ADX, Aroon, Vortex, TTM Squeeze, Z-Score, Beta). Brings us from "30 indicators" to "50 indicators" — psychologically crosses the "professional-grade" threshold for evaluators comparing libraries. **Each PR follows the existing `calcXState.ts` + `calculators.ts` SoA-aware pattern; zero architectural cost.**
2. **Fibonacci drawing pack** (`Retracement` as drawing + Extension/Fan/Arc/Time-Zones/Channel) — one 2-week PR that uses the existing anchor primitive in `src/plugin/types.ts:353` and the registry pattern in `src/core/drawing/index.ts:638`. Closes 8 drawing-tool gaps from one chassis. Visible delta to retail traders.
3. **Trivial alt chart types** (Bar, Line, Area, Baseline, Hollow Candle, Heikin Ashi) — one 3-week sprint adds 6 chart types using the existing candle scaffolding. Heikin Ashi alone resolves a category of evaluator complaints ("does it even support HA?"). **Does NOT include Renko/Kagi/P&F** — those need ROADMAP §1.1 architecture changes and are GAP-hard.

### 7.3 Three GAP-hard items where surpassing TV is genuinely possible (the moats)

1. **WebGPU renderer + compute shaders for order-flow viz** (ROADMAP §2). Footprint, Order Book Heatmap, real-time CVD on a million-tick dataset are computationally infeasible on WebGL without ugly hacks. WebGPU compute shaders + storage buffers + origin-shift (ROADMAP §2.5) give us 5–10× headroom over TV's current web client. **TV's January 2026 Pine v6 `footprint` request is them conceding the data problem to community Pine; they still don't have a native footprint chart UI. This is our window.**
2. **WASM indicator marketplace** (ROADMAP §4.2). Pine's 150K-script library is a community/network moat, but it's locked to TV's servers. WASM indicators are portable, sandboxed, signable, and run client-side. The play is not "more indicators than Pine" — it's "Pine scripts you can audit, run offline, and embed in any app." If we make Pine→WASM porting take 30 minutes per script via a transpiler, we get the catalog for the price of the runtime.
3. **DuckDB-WASM SQL over Arrow on the client** (ROADMAP §5.2). TV's data is a black box. Letting the user write `SELECT * FROM bars WHERE volume > 3*avg_volume` against millions of in-browser rows is a capability TV cannot retrofit without rebuilding their data plane. Combined with our agent-first surface, this is the "LLM-queryable chart" wedge — and it's structurally impossible for TV without major re-platforming.

### 7.4 Three OUT-OF-SCOPE items (with reasoning)

1. **🚫 Broker integration (100+ brokers).** Each broker is a regulatory + business-development + ongoing-maintenance commitment. TV's 100+ broker integrations are the result of a decade of partnership work plus a team. We are a component library; we ship the brick. The right play is *let users bring their own broker* (they pass execution callbacks; our chart fires them). We win on integration surface, not integration count.
2. **🚫 Screener + watchlist + social network.** These are *product surfaces*, not chart capabilities. Building a screener requires a symbol database, ongoing fundamental-data licensing (ROADMAP §5.4 — structurally not free for US equities), and a vertical UX we'd commit to forever. Same logic for social ideas/comments — that's a community product, not a chart library. Our wedge is "embed our chart into your screener / your social app" — composable, not vertical.
3. **🚫 Real-time US equities / futures market data licensing.** This is a hard legal wall, not an engineering one (ROADMAP §5.4 makes this explicit). NYSE digital-media licenses are tens of thousands per month; Nasdaq TotalView starts at ~$2K/professional/month; CME has distribution tiers. No amount of code closes this — it's a contract problem. Our position is *crypto + chain data + delayed equities (no license) by default; user brings their own license for real-time equities*. Saying this loudly and early prevents enterprise sales blowups.

---

## 8. The one surprise

**TradingView shipped `footprint` and `volume_row` request objects in Pine Script v6 on January 2026** ([pine-script-docs/release-notes/](https://www.tradingview.com/pine-script-docs/release-notes/)) — the data hooks include `Point of Control`, per-row buy/sell volumes, and footprint-anchor introspection. **But TradingView still does not ship a native footprint chart UI.** They handed the data to Pine scripters and left the visualization layer empty.

This is the strongest possible market signal that **ROADMAP §3.3 (Footprint Chart as a P1 differentiator)** is the right bet at the right time. TV themselves believe the order-flow data layer matters in 2026 — they just decided to outsource the chart to their community rather than build it. We're betting we can ship a polished native footprint UI before any Pine community script catches mind-share. **The window is open and TV told us so by what they shipped *and* what they didn't.**

A secondary surprise the other way: **we natively ship FVG / Order Block detection** in `src/core/indicators/zonesState.ts` (commit `9c05f04`) under MIT license. TradingView users pay LuxAlgo $39.99/mo for this exact thing. The catalog of "things TV charges money for that we ship free" is bigger than we publicly tell. The README and a `KILLER_INDICATORS.md` page should make this loud.

---

*End of analysis. See `docs/ROADMAP.md` for the engineering plan that operationalises these findings.*
