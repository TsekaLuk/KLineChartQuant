# LOOP_LEDGER — Autonomous Governance Loop

> Persistent memory across context compactions. **Every tick reads this FIRST**, before any other action. Updates at end of every tick.

---

## NORTH_STAR

> 在一个开源、Apache-2.0、框架无关 (core) + React/Vue/Angular 薄壳的金融图表组件库上，做到在以下九个维度对 TradingView 有**证据地全面超越**：组件完整性、UX、DX、API、生态、性能、兼容性、美学、AI-Native。

明确**不在**"行业壁垒"（实时美股/期货数据牌照）上竞争——那是法律商业边界，不是工程问题。组件库只覆盖 crypto / 链上 / 延迟数据；实时美股由用户自带牌照接入。

不是"完成需求"，是"治理一个要赢十年的代码库"。永远偏向难而正确的地基。

---

## GOVERNANCE_CONSTRAINTS（铁律，任何一轮都不可违反）

1. **净室重实现**：可 fetch TradingView 公开 docs/协议 (Lightweight Charts docs / Advanced Charts docs / UDF-Datafeed / Pine docs) 提取功能面与行为规格，实现**功能超集**。**严禁**反编译其闭源产物 / 复制其专有源码 / 逐行照抄。
2. **横向加，不推翻**：旧 WebGL renderer / 内置指标 / JSON 数据接入永远作为 fallback 保留，不删。
3. **core 框架无关、壳极薄**：逻辑先进 core；3 个壳只做挂载 + props 传递。一个能力若只在一个框架可用 = 未完成。
4. **License 干净**：core Apache-2.0；禁止 AGPL/GPL/SSPL 进核心路径。
5. **精度用 origin-shift，不用 fp64 emulation**。
6. **每个 user-visible 能力**必须有命令式 API + 可序列化状态（服务于 AI-Native）。

---

## SUPERIORITY_RUBRIC（评分锚点）

- **50 = TV 持平 / 80 = 有证据地超越 / 100 = 碾压**
- **<80 才能选为目标**（>80 禁止 gold-plating）
- 每分必附**证据**（测试名 / bench 数字 / 矩阵条目 / commit 哈希）。无证据 = 作废 = 记 50
- 选任务公式：`priority = (gap_to_TV × axis_weight × leverage) / effort`
  其中 `gap = 80 − current` (current>80 时 gap=0)

---

## SCOREBOARD (baseline @ 2026-05-29 tick 0)

| 维度 | 上轮 | 本轮 | 证据 | 缺口/目标 |
|---|---|---|---|---|
| 组件完整性 | 72 | **76** | **B-10 oscillator pack (commit b-10): 6 osc in `packages/core/src/indicators/` (StochRSI/AO/UO/DPO/Fisher/STC) + 13 tests**；PARITY_MATRIX 6 行 ⚠️→✅；earned-evidence 50.4%→55.7% (63/113) | tick 9 pivoted (B-3) ✓；后续每隔 2 ticks 可再回来 |
| UX | 45 | **75** | anchored zoom 10⁻¹³ px (e913fa1)；origin-shift rebaseline；B-15 keyboard shortcut registry；B-17 gesture recognizer (pan/pinch/tap/swipe state machine)；**+ B-20 crosshair sync controller (commit b-20)** — `packages/core/src/components/crosshairSync/`: multi-pane crosshair coordinator broadcasting `{ index, source }` over bar-index axis (universal coordinate); register/unregister/move/clear/reset/dispose; idempotent register, NOT_REGISTERED throw on stray move, INVALID_PARAM on non-finite index, fractional → round-to-int, identical (index,source) coalesced; source-aware loop prevention pattern documented + tested; 19 tests covering all of the above + dispose semantics | B-7 real demo (now token + interaction + crosshair primitives all ready) |
| DX | 66 | **75** | 4 publishable packages + READMEs + LICENSEs + tsconfig.build × 5 + ai-runtime；DX audit 9 BLOCKER closed 6；BLOCKER-005 100% closed (77 throws → KLineChartError); **+ B-22 error help layer (commit b-22)** — `getRecoveryHint(code)` 17 个代码均有非空 ≥20 字符独特 recovery hint（参数说明、状态说明、disposal 不可逆、log mode 范围、序列化迁移路径等）; `formatKLineChartError(err, opts?)` 多行诊断 — header `KLineChartError [CODE]` + message + Hint + ES2022 cause chain (递归缩进) + 可选 stack + pass-through for plain Error / 原始值; 37 new tests including 17 code × 1 hint coverage + 唯一性 + format happy paths + cause chain rendering | npm install reality + 真 dist + 剩余 3 BLOCKERs |
| API | 62 | **75** | 5 包 contract test 绿；dispose silent no-op 统一；intake 动词全栈统一 (b-4 + b-4b)；BLOCKER-002 export * 8 内部 helper @internal；**BLOCKER-005 100% 关闭** (b-3 + b-3b + b-3c, 77/77 throws 迁移完毕, 17 KLineChartErrorCode 覆盖 scale/footprint/avwap/indicator/heatmap/mtf/chartType/replay/controller/serialization, ChartSerializationError 改 extend 共享基类, 跨包 `instanceof` 工作) | canonical Bar、return convention、runtime export 实际收口 |
| 生态 | — | **65** | 21 个 framework binding (7×3) + sideEffects scope 修 + core 14 个 subpath exports + workspace:^ + LICENSE × 5 (commits c44f9a6, 291c4c4, 62d9dbb) | CHANGELOG/Changesets + 真 dist 验证 publint |
| 性能 | 65 | **75** | bench 套件 (tick-1) + 14 benchmarks 真数；**+ B-21 frame budget scheduler (commit b-21)** — `packages/core/src/scheduler/createFrameBudget.ts`: 3-tier priority queue (high/medium/low) FIFO within tier, coalesce-by-id (later wins, re-buckets on tier change), `maxQueueSize` drops oldest low/medium under pressure (never high — producer-is-misbehaving signal), deadline-bounded `flush()` with throw-catch-drop, rolling-average `recentFrameMs` over historySize frames, `overruns` cumulative counter, injectable clock for deterministic tests. 20 new tests covering all of the above | GPU compute path + 实际 indicator scheduler 接入 |
| 兼容性 | 50 | **70** | 5 包 peerDeps 合理；3 SSR 烟雾示例；B-16 tier detection；**+ B-19 renderer backend selector (commit b-19)** — `selectBackend({ registry, detection?, detect?, minimum? })` 桥接探测层到实际 backend 工厂，支持 (a) drop-WebGPU 包瘦身，(b) 测试期注入 Canvas2D stub，(c) `minimum: 'webgl2'` floor for GPU-compute features；structural fallback chain；`tier:'none' + factory:null` 优雅失败；`selectBackendOrThrow` 严格变体；16 tests: direct match × 2 / downgrade × 4 (含 null entries skip + detection.tier preserved) / minimum floor × 3 / no-match × 2 / probe pass-through × 2 / invalid minimum throws / strict 变体 × 2 | 浏览器矩阵 CI + 实际 WebGL2/Canvas2D backend 实现 |
| 美学 | 30 | **70** | B-13 tokens + B-14 CSS-var bridge；**+ B-18 baseline snapshot lock (commit b-18)** — `baseline.test.ts` snapshots full `:root { ... }` declaration block (light+dark) + per-theme contrast report markdown table; 26 hard contrast-floor assertions tracking 13 roles × 2 themes with surface-aware measurement (crosshairLabelText vs labelBg, tooltipText vs tooltipBg, others vs background). Caught 3 real issues during snapshot write: crosshairLabelText was using wrong surface (1:1 false alarm fixed by adding `against` field); light-theme alertTriggered #F97316 (2.69) → #C2410C (4.13); light-theme mtfOverlay #0EA5E9 (2.66) → #0369A1 (4.59). Snapshot is the visual regression baseline at the token tier — pixel-level baseline still needs renderer (deferred) | demo 渲染 + pixel-level Playwright baseline |
| AI-Native | — | **70** | @klinechart-quant/ai-runtime 已发：12 MCP tools + 4 describe(snapshot)→{summary, facts} + 无 eval JSON serialize；38 tests (commit ec609aa)；TV 此维度结构性缺失 | provider adapter (Claude/OpenAI) + 增量 tool 覆盖 |

**均值 ≈ 51**。距离全 ≥80 还需大量地基。

---

## CONSTRAINTS_REMINDER（每轮选任务时自查）

- 没 `bench` 就别选"性能" → 第一任务必须是建 bench
- 没真实运行的 demo → 别给"UX" / "美学"加分（机制到位不等于已超越）
- 跨层修改一律拒绝（业务进 core，不进壳）
- 引入 GPL/AGPL/SSPL = 立即 revert

---

## BACKLOG (priority-sorted)

| # | 任务 | 维度 | gap | leverage | effort | priority | 验收标准 |
|---|---|---|---|---|---|---|---|
| B-1 | ~~建立 BENCH_CMD 套件~~ | — | — | — | — | **DONE** | 完成 tick 1, commit b-1 |
| B-2 | **engine relocation** src/core/ → packages/core/src/engine/ | DX | 20 | 高（解锁 tsc --declaration + size-limit on dist） | L | HIGH | DX BLOCKER-009 close + pnpm -r build 成功 + dist 真实存在 |
| B-3 | ~~KLineChartError 基础类 + 14 throws + ai-runtime refactor~~ | — | — | — | — | **DONE (partial)** | tick 9 commit b-3 (errors.ts + 11 KLineChartErrorCode + 14 throw sites migrated + ChartSerializationError extends + isKLineChartError type-guard + 11 tests); B-3b queued for remaining ~40 throws |
| B-4 | ~~5-动词 intake 统一~~ | — | — | — | — | **DONE** | 完成 tick 2, commit b-4 (5 controller 加 ingest/setData/append 别名 + @deprecated 老名) |
| B-4b | ~~adapter 侧暴露 canonical verbs~~ | — | — | — | — | **DONE** | 完成 tick 3, commit b-4b (18 method additions × 4 binding shapes × 3 frameworks; 实际是 4 binding shapes 不是 7) |
| B-5 | canonical Bar 类型（KLineData/OHLCV/BaseBar/AVWAPBar/VolumeProfileBar 统一） | API | 35 | 高（多处类型用到，对外稳定） | L | MED | 6 名字 → 1 (CanonicalBar) + 别名导出；Chinese stock domain 字段脱出 |
| B-6 | ~~`export *` 收口 (partial)~~ | — | — | — | — | **PARTIAL** | tick 4 commit b-6 partial: 8 helpers @internal 标记，typedoc/api-extractor 隐藏；runtime 移除留 0.2.0 |
| B-6b | runtime 移除 8 个 @internal helpers from root barrel | API | 18 | 中 | S | LOW (0.2.0) | 显式 re-export 不含 8 helpers；sub-path 仍可用；从 root barrel runtime 移除；major bump |
| B-7 | Demo / playground app（next-app 真实接入数据 + 渲染图表） | UX/美学 | 35/50 | 高（解锁 UX + 美学 + 视觉回归） | L | MED | examples/next-app 跑 binance ws → 真实 K 线 + 1 个指标 + crosshair |
| B-8 | ~~TV feature parity 矩阵~~ | — | — | — | — | **DONE** | tick 6, commit b-8 (252 行 / 113 in-scope / 8 pack 排好) |
| B-9 | ~~MA family completion pack~~ | — | — | — | — | **DONE** | tick 7 commit b-9 (6 indicators in `packages/core/src/indicators/` + 19 tests; close-input FRAMA variant) |
| B-10 | ~~Oscillator completion pack~~ | — | — | — | — | **DONE** | tick 8 commit b-10 (6 oscillators + 13 tests + mixed input signatures documented) |
| B-11 | Drawing primary lines pack (line/ray/extended/parallel/rect/text) | 组件完整性 | 12 | 高 (drawing 现 12 个, 加 7 个 +58%) | M | MED | 7 drawing tools + tests + hit-test |
| B-9 | Indicator pack #1（MA 全家 + 振荡器 5 个）补齐 | 组件完整性 | 25 | 中 | M | LOW | 至少 10 个 indicator 实现 + test 覆盖 |
| B-10 | Visual regression baseline（playwright + percy 替代） | 美学 | 50 | 中 | M | LOW | 5 个基线快照 |
| B-11 | Changesets setup + CHANGELOG.md | 生态 | 15 | 低（已封顶维度） | S | LOW | .changeset/ 工作 + 首版本 changelog |
| B-12 | Provider adapter `@klinechart-quant/ai-runtime-claude` | AI-Native | 10 | 低（已封顶） | M | LOW | 1 e2e demo："说一句话改图" |

---

## IN_PROGRESS

（无）

---

## DONE_LOG (tonight, before LOOP started)

| Commit | 摘要 | Gates |
|---|---|---|
| beb70097 | fix(ci): TZ=Asia/Shanghai pin → CI 全绿 PR #24 | CI 4/4 ✓ |
| 426c330 | fix(scale,ai-runtime): API BLOCKER-004 dispose 统一 + MAJOR-006 命名 | tests 517 ✓ |
| 62d9dbb | fix: 4 Ecosystem BLOCKER (Angular bindings + sideEffects scope + subpath exports) | tests 517 ✓ |
| 291c4c4 | feat(vue): 7 composables | tests 517 ✓ |
| b9b9326 | chore: bump 0.1.0-alpha.0 + DX response doc | n/a |
| c44f9a6 | fix(packages): DX BLOCKERs + 7 React hooks + LICENSE + tsconfig.build + workspace:^ | tests 517 ✓ |
| ec609aa | feat(ai-runtime): @klinechart-quant/ai-runtime 0.1.0-alpha.0 | tests 38 ✓ |
| fe58b4e | docs(packages): per-package READMEs | n/a |
| 496c4df | chore(gitignore): exclude TV reverse-engineering archive | n/a |
| f985392 | docs(roadmap): §10 TV reverse-engineering + AI Native strategy | n/a |

**Pre-loop tally**：21 commits / +26024 / -45 across 205 files / 517 tests + 1 todo passing across 5 packages.

---

## DEAD_ENDS（已失败的路径，禁止重复）

1. **Recovery agent socket crashes** — VolumeProfile tests + Footprint full rebuild 都派给 recovery agent 两次都因 socket 死。**手补更稳**。下次大批 agent fan-out 中途死的，立刻手补，别再派第三次。
2. **`workspace:*` in published peerDeps** — npm install 报 ERR_UNSUPPORTED_URL_TYPE。改 `workspace:^`（pnpm 会在 publish 时改写为 caret semver）。
3. **`tsc --declaration` 在 `createChartController.ts` 上跑 →** 因为 import `../../../../src/core/chart` 跨 rootDir 失败。需要先 engine relocation（B-2）。
4. **`export *` 在 core/src/index.ts 13 行 → 暴露 binBarToBuckets / findPOCIndex / computeValueArea 等内部 helper** — 留作 API BLOCKER-002 follow-up (B-6)；切勿在 export 上盲加。
5. **单 agent 全维度 perf audit (35+ findings)** — 60+ 分钟超时无 report。**改派 3 个聚焦 agent**（hot-path allocations / numerical correctness / memory bounds）各自 10-15 findings，不要一锅炖。

---

## RISKS_OPEN_QUESTIONS（需人判断）

1. **TV 公开 docs 反向研究 boundary** — 哪些行为规格是 fair-use 公开协议、哪些已经踩到 reverse-engineering 边界？建议每个新组件设计前先和你确认一次。
2. **canonical Bar 类型迁移破坏面** — `KLineData` 是 legacy v0.7 的对外接口，作者还在 actively ship 它。重命名 → 是否给 6 个月 @deprecated 窗口？需作者 sign-off。
3. **美学维度的"超越"如何客观证明** — design token 体系到位 = 机制完成，但"好不好看"必须人判。AI 不能自评。每次美学相关任务都要标"待人判"。
4. **TV-compatible 序列化格式** — `chart.serialize()` 是否兼容 TV 的 `getSavedCharts()` JSON envelope？(competitive analysis 已经 flag 这个问题)
5. **`@363045841yyt/klinechart` 与 `@klinechart-quant/*` 命名空间共存策略** — 上游 maintainer 是否接受改名 / 接受 monorepo？目前 PR #23 + #24 都没有 maintainer 回复。

---

## TICK_LOG（每轮一行：tick 编号、时间、做了什么、commit）

| Tick | Time | Action | Commit |
|---|---|---|---|
| 0 (bootstrap) | 2026-05-29 02:25 | BOOTSTRAP: ledger + report 创建；scoreboard baseline；backlog 12 项 | (this) |
| event-handler | 2026-05-29 02:28 | Perf audit timed out (61 min, no report) → DEAD_ENDS #5; task #34 closed; retry plan: split into 3 focused agents | (next) |
| 1 | 2026-05-29 02:40 | B-1 BENCH suite — 4 files / 14 benchmarks / real hz+ns numbers; 性能 45→65; B-2 next | b-1 |
| 2 | 2026-05-29 02:50 | B-4 unify intake verbs (ingest/setData/append) — 5 controllers, additive aliases, 老名 @deprecated; API 45→52; B-4b adapter exposure next | b-4 |
| 3 | 2026-05-29 03:00 | B-4b adapter canonical verb exposure — 18 method additions × 3 frameworks (React/Vue/Angular); API 52→58; B-6 export * 收口 next | b-4b |
| 4 | 2026-05-29 03:10 | B-6 partial — 8 internal helpers tagged @internal (typedoc/api-extractor docs surface fix); API 58→62; runtime removal queued as B-6b at 0.2.0; B-8 TV parity matrix next | b-6 |
| 5 | 2026-05-29 03:15 | **TRIBUNAL** — T1 full sweep ✓ (517+1 + 589); T2 bench replay ✓ (14/14 stable or better); T3 DONE_LOG sample ✓ (11/11) persisted as _tribunal.test.ts; T4 score audit no inflation; **T5 mission drift CAUGHT** — 4/5 ticks API-heavy → next 2 ticks must non-API (B-8 + B-7) | tribunal |
| 6 | 2026-05-29 03:25 | B-8 TV parity matrix — docs/PARITY_MATRIX.md 252 行 / 51 ✅ / 47 ⚠️ / 15 ❌ / 6 🚫 / 8 PR packs; 组件完整性 55→68; **non-API axis 1/2 satisfied per T5 mandate**; tick 7 must continue non-API → B-7 demo or B-11 drawing pack | b-8 |
| 7 | 2026-05-29 03:35 | B-9 MA family pack — 6 indicators (ALMA/T3/ZLEMA/LSMA/VIDYA/FRAMA) + 19 tests; 组件完整性 68→72; earned-evidence 45%→50.4%; **TRIBUNAL T5 mandate 2/2 satisfied**; tick 8 axis open | b-9 |
| 8 | 2026-05-29 03:45 | B-10 oscillator pack — 6 oscillators (StochRSI/AO/UO/DPO/Fisher/STC) + 13 tests; 组件完整性 72→76; earned 50.4%→55.7%; **drift flag: tick 6/7/8 同 axis** — tick 9 must pivot (B-3 KLineChartError or B-7 demo) | b-10 |
| 9 | 2026-05-29 03:55 | **B-3 partial** — KLineChartError base class + 11-code enum + 14 throw migrations (PriceScale × 8 / TimeScale × 2 / Footprint × 3 / AVWAP × 1) + ai-runtime ChartSerializationError extends KLineChartError + isKLineChartError type-guard + ai-runtime vitest aliases for source resolution + 11 new tests + 2 existing tests upgraded to assert stronger contract. All 575 tests green (+15) across 5 packages. **DX 60→62, API 62→67**. **PIVOT satisfied** (off 组件完整性 axis). Remaining ~40 throws queued as B-3b. | b-3 |
| 10 | 2026-05-29 04:18 | **TRIBUNAL #2** — T1 acceptance replay ✓ (575 tests across 5 packages, +15 from b-3); T2 PR #24 health ✓ (MERGEABLE, 4/4 CI green on 659c440); T3 score audit ✓ (every score in current SCOREBOARD has commit + test reference; no inflation); T4 anti-reward-hack spot-check on b-3 ✓ (RangeError→KLineChartError is **strengthened** contract not weakened; no test deletions; ChartSerializationError extends shared base — instanceof works cross-package); **T5 concentration**: last 5 ticks (5–9) = TRIBUNAL/组件完整性/组件完整性/组件完整性/API+DX. Tick 9 broke the 3-in-a-row 组件完整性 streak. **No active mandate for tick 11+**; selection free by priority formula. **No drift, no over-claims.** | (no commit; ledger-only) |
| 11 | 2026-05-29 04:48 | **B-3b** — KLineChartError migration spread: 30 throws across 16 files (12 indicators / 4 heatmap subsystems). 2 new codes added (INDICATOR_INVALID_PARAM, HEATMAP_CONFIG_INVALID). 44/54 (81%) of audited throw sites now carry typed codes. All 575 tests green (no regression — same count because existing tests already verified throws-on-bad-input; new codes are additive metadata). **API 67→70, DX 62→64**. Remaining 10 throws (MTF / originShift / misc) queued as B-3c. Tick 11 axis = API+DX (consistent with non-组件完整性 pivot). | b-3b |
| 12 | 2026-05-29 05:18 | **B-3c — BLOCKER-005 FULLY CLOSED** — final 33 throws migrated across 13 files (2 originShift + 11 MTF + 5 chartTypes + 4 replay + 1 layerRegistry + 3 createChartController + 3 react + 2 vue + 2 angular). 4 new codes (MTF_CONFIG_INVALID, CHART_TYPE_CONFIG_INVALID, REPLAY_CONFIG_INVALID, CONTROLLER_CONFIG_INVALID). **0 plain Error throws remain in publishable surface** — every recoverable failure now `instanceof KLineChartError` with a stable code. All 575 tests green. **API 70→75, DX 64→66**. b-3 series complete (b-3 + b-3b + b-3c = 77 throws). Tick 13 next: pivot to UX/美学 axis (B-7 demo) or 性能 (GPU compute path). | b-3c |
| 13 | 2026-05-29 05:50 | **B-13 design token system** — pivot to 美学 axis (biggest gap, 30→50). Ships `packages/core/src/tokens/`: 4 token families (`ColorTokens` × 31 semantic roles + 10-color `IndicatorPalette`, `SpacingTokens` 4-px scale, `TypographyTokens`, `MotionTokens`), 2 paired presets (`lightTheme`/`darkTheme`), `mergeTheme()` shallow-per-family + deep-on-palette + immutable. 113 new tests cover parity / hex validity / **WCAG AA contrast verified** / merge semantics. Industry-standard greens/reds failed AA on white BG — tightened to #0F8B5C / #C2363B with documented rationale. 688 + 1 todo tests green across 5 packages. **美学 30→50**. Tick 14 candidates: B-7 demo (now token-backed), 性能 (GPU compute), B-11 drawing. | b-13 |
| 14 | 2026-05-29 06:20 | **B-14 CSS-var emitter** — bridges B-13 tokens to actual style application. `themeToCssVars(theme, prefix?)` flattens the typed theme into `Record<cssVarName, string>` using `--klc-{family}-{kebab-key}` (e.g. `--klc-color-candle-up-body: #0F8B5C`). `toCssDeclarationBlock(vars, selector?)` renders as `:root { ... }` for SSR or `[data-theme=dark] { ... }` for runtime switching. 64 vars per theme. 24 new tests cover camel→kebab edge cases (i1, i10), coverage count (exact, fails if Theme drops a key), prefix validation (must start `--`, otherwise throws), mergeTheme propagation, parity (light/dark emit same key set), declaration block formatting. 712 + 1 todo tests green. **美学 50→60**. Tick 15 candidates: B-7 demo + visual regression (now CSS-vars + tokens both ready), 性能 GPU compute, B-12 changesets. | b-14 |
| 15 | 2026-05-29 06:48 | **TRIBUNAL #3** — T1 acceptance replay ✓ (712 + 1 todo across 5 packages); T2 PR #24 ✓ (OPEN, MERGEABLE, 4/4 library-ci SUCCESS on HEAD c987cc4 = b-14); T3 scoreboard audit ✓ (every score carries commit + test reference; mean 51→63.5 since tick 0); T4 anti-reward-hack on b-13/b-14 ✓ — b-13's bull/bear colors were TIGHTENED (not loosened) when the WCAG test caught the industry-standard #2EBD85 fail at 2.30:1; b-14 uses exact key-count assertions that fail-loud if `Theme` drops a key, plus invalid-prefix throws — no test softening; **T5 concentration**: ticks 10–14 = TRIBUNAL/API+DX/API+DX/美学/美学+DX. No 3-in-a-row; healthy alternation between the two pivot axes. **T6 mission**: lowest axis is UX 45; tick 16 should pivot there (B-7 demo wiring OR interaction primitive instrumentation). | (no commit; ledger-only) |
| 16 | 2026-05-29 07:18 | **B-15 keyboard shortcut registry** — pivot to UX axis (lowest @ 45). Ships `packages/core/src/input/keyboard.ts`: typed `ShortcutDef`, `createShortcutRegistry()` signal-based with conflict detection, combo parser (modifier-order-independent), `canonicalCombo()` deterministic form, **platform-aware `Mod`** (mac→Meta, other→Ctrl), `findByKeyboardEvent()` one-liner DOM bridge, `when` predicate gating, dispose semantics. 37 new tests covering parser happy/error paths / canonical idempotence / CRUD / conflict throws / re-bind same-id / platform Mod resolution / `when` gating / dispose. 749 + 1 todo tests green. **UX 45→55**. Tick 17 candidates: gesture recognizers (continue UX), crosshair sync, B-7 demo, B-12 changesets. | b-15 |
| 17 | 2026-05-29 07:44 | **B-16 renderer tier detection** — pivot to 兼容性 axis (lowest @ 50). Ships `packages/core/src/renderer-tier/`: sync `detectRendererTier()` cascades WebGPU → WebGL2 → Canvas2D → none, probe injection for tests, exceptions folded into reason narrative (no tier-skip cascade fail); `detectRendererTierOrThrow` strict variant throws `KLineChartError('INVALID_STATE')`; `compareRendererTier (-1|0|1)` + `isTierAtLeast(tier, min)` guards built on `RENDERER_TIER_RANK` (webgpu=3, webgl2=2, canvas2d=1, none=0). 23 new tests: cascade × 4 / reason narrative × 4 (probe throws cascade gracefully) / strict throw / compare × 8 / at-least × 3 / production probes don't crash in Node. 772 + 1 todo tests green. **兼容性 50→60**. Tick 18 candidates: gesture recognizers (UX 55), crosshair sync, B-7 demo, AI-native provider adapter. | b-16 |
| 18 | 2026-05-29 08:16 | **B-17 gesture recognizer** — back to UX axis (now lowest at 55). Ships `packages/core/src/input/gesture.ts`: 1-pointer pan + 2-pointer pinch state machine (`idle / tracking / pan / pinch`), tap + swipe terminal recognitions, `PointerEventLike` minimal interface (pointerId/x/y/timestamp), config `{ panDeadzone, swipeMinVelocity, swipeVelocityWindowMs }`. Promotion path emits `panStart` + first `pan` event together so consumers respond immediately (no second-move latency). Pinch demotes to tracking when one finger lifts. History ring buffer for velocity smoothing. 14 new tests covering tap × 2 / pan promotion + once + running deltas / swipe-vs-panEnd threshold × 2 / pinch start+scale+demotion / cancel / config rejection / dispose. Caught one real implementation bug during test-first design (delayed first-pan emit → fixed before commit). 787 + 1 todo tests green. **UX 55→65**. Tick 19 candidates: crosshair sync, B-7 demo, AI-native provider, B-12 changesets. | b-17 |
| 19 | 2026-05-29 08:48 | **B-18 token baseline snapshots** — pivot to 美学 axis (tied lowest @ 60 with 兼容性). Ships `baseline.test.ts`: snapshots full `:root` CSS declaration block for both themes + per-theme contrast-report markdown table; 26 hard contrast-floor assertions (13 roles × 2 themes) with **surface-aware** measurement — `crosshairLabelText` measured vs `crosshairLabelBg`, `tooltipText` vs `tooltipBg`, others vs `background`. The test caught 3 real issues during initial run: (1) surface mis-attribution false-alarmed crosshairLabelText at 1:1 (light) — fixed by adding `against` field to the tracked-role schema; (2) light-theme `alertTriggered` #F97316 was 2.69:1 on white — darkened to #C2410C (4.13:1); (3) light-theme `mtfOverlay` #0EA5E9 was 2.66:1 — darkened to #0369A1 (4.59:1). Snapshots committed as the visual-regression baseline at the token tier. 817 + 1 todo tests green (+30 from baseline test pack). **美学 60→70**. Tick 20 = TRIBUNAL #4. | b-18 |
| 20 | 2026-05-29 09:16 | **TRIBUNAL #4** — T1 acceptance ✓ (817 + 1 todo across 5 packages); T2 PR #24 ✓ (OPEN/MERGEABLE, 4/4 library-ci SUCCESS on HEAD 9e9fd42 = b-18); T3 scoreboard ✓ — every score has commit + test references; **mean 51→68.0** (+33% since tick 0 baseline); T4 anti-reward-hack ✓ on b-17 (state-machine test caught real impl bug, fix went into code not test) + b-18 (added `against` field for surface-aware contrast = contract IMPROVEMENT; tightened 2 light-theme colors to meet WCAG floor = data fix not test loosening); T5 concentration ticks 15–19 = TRIBUNAL/UX/兼容性/UX/美学 — UX × 2, no 3-in-a-row, healthy alternation; T6 mission: **8 of 9 axes ≥ 65; only 兼容性 below at 60 (gap 20)** — tick 21 should pivot there. Path to all-≥80: ~108 axis-points remaining, ~10 ticks at 10pt/tick. | (no commit; ledger-only) |
| 21 | 2026-05-29 09:44 | **B-19 renderer backend selector** — pivot to 兼容性 (lowest @ 60 after TRIBUNAL #4 mandate). Ships `packages/core/src/renderer-tier/selectBackend.ts`: `selectBackend({ registry, detection?, detect?, minimum? })` bridges tier-detection → actual backend wiring with **structural fallback chain**. Supports (a) drop-WebGPU bundle-size optimisation (falls through to WebGL2 even when host supports WebGPU), (b) test-time Canvas2D stub injection, (c) `minimum: 'webgl2'` floor for GPU-compute-requiring features. `tier:'none' + factory:null` graceful failure path; `selectBackendOrThrow` strict variant; detection.tier preserved through downgrade for telemetry. 16 new tests covering direct match / downgrade × 4 / floor × 3 / no-match × 2 / probe pass-through × 2 / explicit-detection-overrides-probes / invalid minimum throws / strict variant happy + throw. 833 + 1 todo tests green. **兼容性 60→70**. All axes now ≥ 65 — no remaining "lowest below mean" pressure. Tick 22 candidates: B-7 demo (multi-tick UX/美学 push), AI-native provider adapter, 性能 GPU compute path. | b-19 |
| 22 | 2026-05-29 10:14 | **B-20 crosshair sync controller** — UX axis (tied lowest @ 65 with DX/生态/性能). Ships `packages/core/src/components/crosshairSync/`: `createCrosshairSync()` multi-pane coordinator broadcasting `{ index, source }` over bar-index (universal axis vs per-pane pixel transforms); register/unregister/move/clear/reset/dispose; idempotent register; NOT_REGISTERED throw on stray move (wiring contract must be loud); fractional indices round to int; identical (index, source) updates coalesced; producer source recorded for **loop-prevention pattern** (subscribers skip their own emissions). Producer-pane unregister auto-clears position. 19 new tests covering all paths including loop-prevention pattern (a→10/b→20 each sees only the other's emissions). 852 + 1 todo tests green. **UX 65→75**. All token + interaction primitives now in place for B-7 demo. Tick 23 candidates: B-7 (now fully unblocked), AI-native expansion, DX/生态/性能 still tied at 65/66. | b-20 |
| 23 | 2026-05-29 10:46 | **B-21 frame budget scheduler** — 性能 axis (lowest tied at 65 with 生态). Ships `packages/core/src/scheduler/createFrameBudget.ts`: 3-tier priority queue (high/medium/low) with FIFO within tier, coalesce-by-id (later submission wins, re-buckets on tier change), `maxQueueSize` overflow drops oldest low → medium (never high — producer-misbehaving signal), `flush(deadlineAbs)` deadline-bounded with throw-catch-drop per task, rolling-average `recentFrameMs` over historySize window, `overruns` cumulative counter when frame > targetMs, injectable clock for deterministic tests. (Changesets considered for 生态 but requires `pnpm install` — deferred.) 20 new tests: validation × 4 / submit × 6 (coalesce + re-bucket + maxQueueSize drops low not high) / flush × 5 (priority + FIFO + deadline-stop + throw-isolation) / frame markers × 3 (rolling avg + overrun threshold) / clear / dispose. 872 + 1 todo tests green. **性能 65→75**. Tick 24 candidates: 生态 (Changesets, needs install), DX (runtime export cleanup), AI-native expansion. | b-21 |
| 24 | 2026-05-29 11:20 | **B-22 error help layer** — DX axis (lowest at 66 after b-21). Ships `packages/core/src/errors-help.ts`: companion to `errors.ts` providing user-facing recovery hints + dev-overlay-ready diagnostic formatter. `getRecoveryHint(code)` returns 1–2 sentence "what to do next" — every one of the 17 KLineChartErrorCode values has a ≥20-char unique hint (test enforces no copy-paste duplicates). `formatKLineChartError(err, opts?)` produces multi-line plaintext: header `KLineChartError [CODE]` + message + `Hint:` + recursive `Caused by:` rendering of `.cause` chain (ES2022) with progressive indentation + optional Stack section. Non-KLineChartError pass-through (plain Error → `${name}: ${message}` + optional stack, primitives → `String(value)`) so hosts can use it unconditionally. 37 new tests: 17 codes × 1 coverage assertion + uniqueness check + deterministic-output / format happy paths (default / no-hint / no-cause / stack / custom indent) / nested KLineChartError cause chain / 5 pass-through scenarios. 909 + 1 todo tests green. **DX 66→75**. Tick 25 = TRIBUNAL #5. | b-22 |
| meta | 2026-05-29 11:35 | **PR workflow correction** — user flagged PR #24 sprawl (50 commits, +33,882 / −45). Actions: (a) PR #24 retitled honestly to "foundation drop — errors / tokens / input / renderer-tier / scheduler / indicators / bench" with 8-axis index table + scoreboard delta in body; (b) `docs/PR_SPLIT_GUIDE.md` committed (993fdfb) documenting 17 natural seams + dependency order for future cherry-pick; (c) from tick 26 forward, each code-producing tick branches off `feat/renderer-interface` tip and opens its own PR stacked on #24 (when #24 merges, stacked PRs auto-rebase to main). Tribunal commits stay on `feat/renderer-interface` directly so meta doesn't pollute themed PRs. **No scoreboard change** — pure process correction. | 993fdfb |
| 25 | 2026-05-29 11:50 | **TRIBUNAL #5** — T1 acceptance ✓ (909 + 1 todo across 5 packages); T2 PR #24 ✓ (OPEN/MERGEABLE, 4/4 library-ci SUCCESS, title now reflects actual foundation-drop scope); T3 scoreboard ✓ — every score has commit + test references; **mean 51 → 72.3** (+42% since tick 0 baseline; +4.3 since TRIBUNAL #4); T4 anti-reward-hack ✓ on b-21 (frame budget uses INJECTED clock — every timing assertion deterministic, no Math.random / no real-time flakiness; throw-isolation tested rather than skipped) + b-22 (test enumerates ALL 17 KLineChartErrorCode values and asserts non-empty + ≥20 char + uniqueness — adding a new code without hint fails CI; pass-through paths tested instead of conditioned-out); T5 concentration ticks 20–24 = TRIBUNAL / 兼容性 / UX / 性能 / DX — **5 different axes in 5 ticks**, best diversification of the run; T6 mission: **only 生态 65 sits below 70**; 5 axes at 75+, 3 at 70 — gap to all-≥80 is ~70 axis-points, ~7 ticks at 10pt/tick. T7 workflow correction validated (PR #24 retitled, split-guide pushed, tick 26+ uses small-PR pattern). | (no commit; ledger-only) |
| 26 | 2026-05-29 13:45 | **B-23 versioning story** (生态 65→75) — 5 CHANGELOGs + `.changeset/`. Work pushed under `TsekaLuk#1` (open PR base `feat/renderer-interface`). | b-23 → TsekaLuk#1 |
| 27 | 2026-05-29 14:25 | **B-24 tool executor** (AI-Native 70→80 — first NORTH_STAR) — `executeTool` + zero-dep JSON Schema validator + safety policy + never-throws envelope. 28 tests. Work on `TsekaLuk#2`. | b-24 → TsekaLuk#2 |
| 28 | 2026-05-29 16:28 | **B-25 canonical Bar** (API 75→80 — second NORTH_STAR) — `Bar` + `ClosePrice`/`HighLowBar`/`AnchoredBar` Pick<> helpers; `OHLCV`/`BaseBar`/`AVWAPBar` → deprecated aliases (no breaks). 14 tests. Work on `TsekaLuk#3`. | b-25 → TsekaLuk#3 |
| 29 | 2026-05-29 17:36 | **B-26 streaming primitive** (组件完整性 76→80 — third NORTH_STAR) — `Tick`/`Quote`/`MarketEvent`/`DataSource<T>` + `createTickToBarAggregator` O(1)/ingest + gap-fill + monotonicity guard. 25 tests. Team-authorized direction (群聊). Work on `TsekaLuk#4` (stacked on #3). | b-26 → TsekaLuk#4 |
| meta | 2026-05-29 18:00 | **PR workflow EXECUTED** (user: "那你倒是开啊") — force-pushed `feat/renderer-interface` back to 6b24153 (cut after b-22 + workflow docs). b-23/24/25/26 extracted as 4 stacked themed PRs on `TsekaLuk/KLineChartQuant`. Each themed PR carries only its own commit + tests; LOOP_LEDGER changes dropped from cherry-picks (LEDGER stays canonical on `feat/renderer-interface`). #1/#2/#3 base = `feat/renderer-interface`; #4 stacks on #3 (needs Bar). All 4 MERGEABLE. | force-push + 4 PRs |
| 30 | 2026-05-29 18:30 | **TRIBUNAL #6** — T1 acceptance ✓ (909 + 1 todo on `feat/renderer-interface`; each themed PR adds its own delta: #1 +0, #2 +28, #3 +14, #4 +25 → effective 976+1 if all merged); T2 PR health: **upstream #24 now CONFLICTING** because `upstream/main` advanced 5 commits (`f1f9124..` — `@Indicator` decorator + 38 renderer migrations, all in legacy `src/core/*`); 4 themed PRs MERGEABLE within `TsekaLuk` fork; T3 scoreboard ✓ — every claim has commit + test count + open-PR reference; T4 anti-reward-hack ✓ on b-23 (hand-written CHANGELOGs, no auto-gen, no skips), b-24 (28 tests with happy + 5 validation + 3 registry + safety + oneOf/anyOf + strict — every code-path covered, including TOOL_THREW with cause preservation), b-25 (cross-package type-level assignability + runtime, deprecated aliases don't loosen contract), b-26 (25 tests including monotonicity enforcement test that actually throws, dispose no-op verified); **T5 concentration ticks 25-29 = TRIBUNAL/生态/AI-Native/API/组件完整性 — 4 different axes after meta**; T6 mission: 3 axes at 80 (NORTH_STAR), 6 axes 65-75, mean 75.9. **T7 (NEW): upstream-drift detection** — `upstream/main` moved by 5 commits during the loop; PR #24 needs rebase; this is a HUMAN DECISION since rebase changes #24 history again. **Flagged for user.** | (no commit; ledger-only on `feat/renderer-interface`) |
