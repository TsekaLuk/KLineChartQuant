# 0005. Renderer is out of scope for the design overhaul

- Status: Accepted
- Date: 2026-10-09
- Deciders: tseka

## Context

K-line rendering, performance, and chart styling are already good. The overhaul targets productization and UI chrome.

## Decision

No changes to `packages/core/src/engine/**`, `packages/core/src/controllers/**`, or `packages/core/src/foundation/tokens/fonts.ts` as part of this work.

Allowed core touch points: token type additions, `interface-colors.ts`, and preset palettes (`presets/impl/*`). Palette changes alter canvas colors and must keep candle up/down semantics and contrast.

## Consequences

- PRs in this effort that touch the frozen paths are rejected in review.
- Renderer changes need their own task and ADR.
