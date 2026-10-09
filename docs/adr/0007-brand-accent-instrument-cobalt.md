# 0007. Brand accent: Instrument Cobalt

- Status: Accepted
- Date: 2026-10-09
- Deciders: tseka

## Context

KCQ had no brand color. ADR 0001 kept the wordmark and left the accent open. The method agreed on was to benchmark domestic and international competitors, take the category norm, and change exactly one dimension. Nebutra's brand is not a constraint.

The survey covers 28 brands. Details are in task research `competitor-brand-colors.md`.
- The largest cluster is blue, hue 256–266: TradingView, Coinbase, Polymarket, Koyfin, 雪球, 聚宽, 米筐.
- Three candidates were rendered on all 5 presets in both modes (`accent-review.html`).

## Decision

**Instrument Cobalt `#4C77C6`**, OKLCH 0.576 / 0.131 / 261.6. It keeps the blue category norm and changes only one thing: Okhsl saturation drops from 0.971 to 0.654 (OKLCH chroma 0.220 → 0.131). It reads as a calibrated instrument rather than a consumer brokerage.

| Use | Dark | Light |
|---|---|---|
| UI / focus ring / selection (≥3:1) | `#4C77C6` (4.10:1 on #151619) | `#4C77C6` (4.05:1 on #F5F5F7) |
| Accent text (≥4.5:1) | `#537ECD` | `#456FBD` |

Rules:
- Market colors stay semantic. The accent never fills candles or volume bars.
- Use it sparingly: primary action, selection, focus, links, the MA line in preset previews.
- Under tritanopia it sits close to the up color (ΔE 0.080). Never encode up/down with the accent.
- The full 12-step scale is generated from this anchor in OKLCH (design.md §3.2) and must pass the AA gate on every preset surface.

## Consequences

- Rejected: Bronze Amber (closest to the down color under deuteranopia) and Brass Gold (same hue as KLineChart, thin light-mode margin).
- Recall rests on the wordmark and the restraint of the accent, not on hue novelty.
