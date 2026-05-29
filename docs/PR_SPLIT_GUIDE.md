# PR split guide — autonomous-loop output

PR #24 ("foundation drop") grew to 50 commits and +33,882 / −45 lines
during ticks 0–24. Reviewing it commit-by-commit is impractical;
splitting it retroactively is risky because of cross-axis
dependencies on `errors.ts` and the indicator files.

This guide documents (a) **the natural seams that would have been
separate PRs** if the loop had run that way from the start, and (b)
**the workflow from tick 25 onwards** — every code-producing tick
opens its own small PR targeting `feat/renderer-interface` (the
current `#24` branch). Once `#24` merges, stacked PRs auto-rebase
to `main`.

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

## From tick 25 onwards — small-PR workflow

Each code-producing tick:

1. Branch off the current `feat/renderer-interface` tip:
   ```bash
   git checkout -b tick-<N>-<theme> feat/renderer-interface
   ```
2. Implement the tick (the same loop protocol applies — phases 1–9).
3. Commit the code change on the tick branch.
4. Push and open a PR targeting `feat/renderer-interface`:
   ```bash
   gh pr create --base feat/renderer-interface --head tick-<N>-<theme>
   ```
5. After CI, switch back and update LEDGER + TICK_LOG on the
   `feat/renderer-interface` branch (or a dedicated `loop-meta`
   branch with its own long-running PR).

Result: every tick's code change reviewable on its own, while the
loop's tribunal/ledger discipline stays uninterrupted.

If `#24` merges first, the stacked PRs rebase onto `main`
automatically (`git pull --rebase origin main` from each tick
branch).
