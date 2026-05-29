# PR split guide — autonomous-loop output

PR #24 ("foundation drop") grew to 50 commits and +33,882 / −45 lines
during ticks 0–24.

**Decision (2026-05-29, after PR-strategy review with maintainer):**
land `#23 + #24` as the foundation drop and stop trying to split
`#24` retroactively. The fundamental constraint:

- `main` is the historical fork point and **does not have
  `packages/core/`** at all. Any "themed PR off main" must carry
  `#23`'s ~7 k-line monorepo scaffold, which makes it not actually
  small.
- Stacking themed PRs on `#23` produces "stacked PR-of-PR" review
  burden without enough payoff per slice.

This guide documents (a) **the natural seams** at commit-level —
useful as a reading map while reviewing `#24`, AND useful retroactively
if a future maintainer ever wants to cherry-pick a single subsystem
out of the merged commit history; and (b) **the post-merge workflow**
that every autonomous-loop tick from tick 26 onwards follows.

---

## Natural seams in #24 (retrospective)

Use this if you ever cherry-pick from `feat/renderer-interface` into
isolated PRs. Listed in dependency order — earlier groups must land
first.

| # | Theme | Commits | Notes |
|---|---|---|---|
| 1 | **Pre-loop foundation** | `3b7ffa6 e913fa1 67025b8 e0b97e0 be3d635 f985392 fe58b4e 7a09c70 ec609aa c44f9a6 291c4c4 62d9dbb 426c330 4203258 beb7009 a4589af b9b9326` | Independent from later work; pure additions of `render/`, scale, scene, replay, alerts, chartTypes, adapters, ai-runtime. |
| 2 | **Bench suite** | `990a1bf` | Independent. |
| 3 | **API verb harmonisation** | `f854c68 d2153df 78d259d` | Depends on (1); each commit additive. |
| 4 | **Indicators** | `dacd42d 9777d14 3763ec5` | Independent of errors taxonomy at this stage (the per-file throws are still plain `Error`). |
| 5 | **KLineChartError taxonomy — base + initial migrations** | `659c440` | Depends on (1); modifies `scale/`, `footprint/`, `anchoredVwap/`. |
| 6 | **Errors — indicators + heatmap migrations** | `3e161bb` | Depends on (4) AND (5). |
| 7 | **Errors — MTF + chart types + replay + adapters + scene** | `f2b7c59` | Depends on (5); adapters land here. |
| 8 | **Errors — recovery hints + formatter** | `6503e65` | Depends on (5). |
| 9 | **Design tokens — types + presets + merge** | `17ebab9` | Independent. |
| 10 | **Design tokens — CSS-var bridge** | `c987cc4` | Depends on (9). |
| 11 | **Design tokens — baseline snapshots** | `9e9fd42` | Depends on (10). |
| 12 | **Input — keyboard shortcuts** | `48fec1f` | Depends on (1) for reactivity primitive; otherwise independent. |
| 13 | **Input — pointer gestures** | `d0b393e` | Same deps as (12). |
| 14 | **Crosshair sync** | `dd93ddd` | Depends on (1). |
| 15 | **Renderer-tier — sync detection** | `ed2a530` | Depends on (5) for `INVALID_STATE` code. |
| 16 | **Renderer-tier — backend selector** | `0c17c05` | Depends on (15). |
| 17 | **Frame budget scheduler** | `ad4a6fc` | Depends on (1) for signals; (5) for `INVALID_PARAM`. |

The TRIBUNAL + LEDGER `chore(loop):` commits are meta — they're
the autonomous loop's self-audit trail. They have no production
effect and would not appear in split PRs; they'd live on a
`loop-meta` branch.

---

## Workflow from tick 26 onwards

Two phases, gated on whether `#23 + #24` have landed.

### Phase A — pre-merge (until #24 merges to main)

Tick work continues on `feat/renderer-interface` directly. Code +
LEDGER commits land on that branch; CI keeps running on every push.
**No new PRs are opened during phase A** — opening stacked-on-#24
PRs creates churn that nobody wins from (zero diff vs #24 unless
the tick rebases off main, which it can't until #24 merges).

Tribunal commits are LEDGER-only and stay on
`feat/renderer-interface`.

### Phase B — post-merge (after #24 lands on main)

Each code-producing tick:

1. Pull main:
   ```bash
   git checkout main && git pull
   ```
2. Branch off main:
   ```bash
   git checkout -b tick-<N>-<theme>
   ```
3. Implement the tick (the loop protocol's 9 phases still apply).
4. Commit code on the tick branch; commit LEDGER + TICK_LOG
   updates either separately on a long-running `loop-meta`
   branch, or in a final dedicated meta commit on the tick branch
   if the maintainer prefers a single commit per tick.
5. Push and open a PR targeting `main`:
   ```bash
   gh pr create --base main --head tick-<N>-<theme>
   ```

Result: every phase-B tick's code change is a genuinely small PR
(typically 1 file + 1 test file, hundreds of lines, no scaffold
carry).
