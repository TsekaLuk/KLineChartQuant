# 0004. Design token scope and no-raw-values rule

- Status: Proposed
- Date: 2026-10-09
- Deciders: tseka

## Context

Tokens cover color, spacing, typography, and motion only. The Vue UI has 711 raw px lines, radii 4/5/6/8/999px, font sizes 11/13px outside the scale, 31 raw shadows, z-index 1–1010, and 34 raw colors that break light mode.

## Decision

- Add token groups: `radius`, `elevation` (shadow), `zIndex`, `opacity`, `breakpoint`, and a full type scale. Motion gets a duration/easing scale.
- Tokens are defined framework-agnostically and emitted as CSS variables, so they can be shared with nebutra-sailor, Electron, and mobile. Final location depends on the sailor audit.
- Presets (Pro/Exchange/Terminal/Zen/Quant) may override radius, density, and elevation as well as color.
- `packages/vue/src` must not contain raw hex/rgb colors or off-scale px for padding/margin/gap/radius/font-size/z-index. Enforced by stylelint in CI.
- Numeric UI uses `font-variant-numeric: tabular-nums` by default.

## Consequences

- Large but mechanical migration across components.
- The renderer keeps reading `Theme` from core; see ADR 0005.
