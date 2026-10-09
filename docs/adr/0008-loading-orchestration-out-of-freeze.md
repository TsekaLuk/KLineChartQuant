# 0008. Data-loading orchestration is outside the renderer freeze

- Status: Accepted
- Date: 2026-10-09
- Deciders: tseka
- Amends: ADR 0005

## Context

ADR 0005 froze `packages/core/src/engine/**` to protect rendering. History loading also lives under `engine/data/` (`chartDataManager.ts`, `scrollCompensator.ts`, `incrementalLoadHint.ts`). It currently produces a visible defect:
- one 500-bar first page that does not fill the viewport;
- empty slots right-aligned and labelled T-N;
- gap pages loaded one at a time, each with its own flash.

That is loading orchestration, not drawing.

## Decision

These may change, with tests:
- `engine/data/**` loading policy: first-request size, alignment of short data, gap prefetch and batching, load hints.
- `data/**` (provider, buffer, live).
- The decision of whether the time axis shows placeholder past-slot labels.

These stay frozen:
- `engine/renderers/**` drawing code
- `engine/scale/**`
- `controllers/**`
- `foundation/tokens/fonts.ts`

## Consequences

- Loading fixes ship as normal PRs with unit tests on the orchestration.
- Any change to how bars are drawn still needs its own ADR.
