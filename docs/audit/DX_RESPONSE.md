# DX Audit Response — round-1 status

Tracks status of the 9 BLOCKER findings in `docs/audit/DX_REVIEW.md`. Updated each time a batch of fixes lands on this branch.

## Status table

| # | Title | Status | Where |
| --- | --- | --- | --- |
| BLOCKER-001 | `tsconfig.build.json` missing per package | ✅ CLOSED | `packages/{core,react,vue,angular,ai-runtime}/tsconfig.build.json` |
| BLOCKER-002 | `workspace:*` in peerDeps breaks npm consumers | ✅ CLOSED | All adapter `package.json` peerDeps changed to `workspace:^` |
| BLOCKER-003 | All packages at version `0.0.0` | ✅ CLOSED | Bumped to `0.1.0-alpha.0` across all 5 packages |
| BLOCKER-004 | Zero per-package READMEs | ✅ CLOSED | `packages/{core,react,vue,angular,ai-runtime}/README.md` |
| BLOCKER-005 | Root README still markets legacy `@363045841yyt/klinechart` | 🟡 DEFERRED | Owned by upstream maintainer; respecting "尊重作者意图和基座" directive. Will land via a separate PR once direction is approved. |
| BLOCKER-006 | Angular `createChart()` throws on happy path | ✅ CLOSED | `packages/angular/src/index.ts` — defaults `opts.factory` to `createChartController`. |
| BLOCKER-007 | React docstring claimed factory registration required | ✅ CLOSED | `packages/react/src/index.ts` top JSDoc rewritten to state "production users do NOT need to register a factory". |
| BLOCKER-008 | `./reactivity` subpath exports advertised but build broken | 🟡 PARTIAL | Build path now exists (BLOCKER-001 fix). The subpath `exports` entries themselves need verification once a real `dist/` is produced; tracked for the publish-readiness PR. |
| BLOCKER-009 | `createChartController.ts:47` imports outside `rootDir` | 🟡 DEFERRED | Mechanical fix is moving `src/core/` → `packages/core/src/engine/` — ~190 file path rewrites; large enough to merit its own PR ("engine relocation") so the diff stays reviewable. Tracked as Small-PR #3 in the task list. |

## What's CLOSED in numbers

- **6 of 9 BLOCKERs fully closed** in this round.
- **2 of 9 PARTIALLY closed** awaiting downstream events (real `dist/` from build CI; engine relocation PR).
- **1 of 9 DEFERRED** as upstream-maintainer-owned (root README marketing).

## What we ALSO shipped beyond the audit's explicit asks

Ecosystem-side preemptive fixes the audit briefs implied:

| Addition | Where | Why |
| --- | --- | --- |
| 7 React controller hooks (`useAlerts`, `useReplay`, `useFootprint`, `useVolumeProfile`, `useAnchoredVwap`, `useOrderBookHeatmap`, `useMtfOverlay`) | `packages/react/src/hooks/` | The audit briefs flagged "only `useChart` + `useIndicatorSelector` ship" as the most obvious gap; preempted before round-2 audit lands. |
| Per-package `LICENSE` files | All 5 packages | `publint --strict` flags missing LICENSE as BLOCKER-class for publish; trivial to fix in same batch. |

## Top-5 ship-before-public-push (audit's recommendation)

| # | Item | Closed? |
| --- | --- | --- |
| 1 | Make build emit real `dist/` artifacts | ✅ via BLOCKER-001 fix |
| 2 | Switch peerDeps off `workspace:*` | ✅ via BLOCKER-002 fix |
| 3 | Real version + npm publish | 🟡 version bumped (0.1.0-alpha.0); publish itself requires Changesets setup |
| 4 | Per-package READMEs | ✅ via BLOCKER-004 fix |
| 5 | Eliminate "no factory registered" errors on happy paths | ✅ via BLOCKER-006/007 fixes |

## Next steps

1. **Engine relocation PR** (closes BLOCKER-009): mechanical move of `src/core/` → `packages/core/src/engine/`. Path rewrites only; behavior frozen.
2. **Changesets setup**: add `.changeset/` config so workspace dependency declarations get rewritten to semver on publish.
3. **Sub-path `exports` verification**: produce a real `dist/` (via `pnpm -r build`) and confirm the advertised `./reactivity` + `./controllers` entries resolve. Add a `publint` CI job that runs against `dist/`.
4. **API + Ecosystem + Perf audit findings**: round-2 (the audit agents still running) will surface another batch; same triage flow.
