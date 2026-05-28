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
| 组件完整性 | 55 | **68** | **B-8 完成 (commit b-8): docs/PARITY_MATRIX.md 252 行 / 113 in-scope / 51 ✅ / 47 ⚠️ GAP-easy / 15 ❌ GAP-hard / 6 🚫 OUT — 44% earned**；39 legacy indicators + 5 P1 + 4 chart types 全部 file-pointer 验证 ✓；8 PR packs (~10 周) 排好优先 | 关键 indicator pack 实做 (B-9 等) + drawing pack |
| UX | — | **45** | anchored zoom 误差 10⁻¹³ px (commit e913fa1)；origin-shift threshold rebaseline 3× 抑制；但无真实运行图表验证 | 真实 demo 渲染 + 交互保真清单 |
| DX | — | **60** | 4 publishable packages + READMEs + LICENSEs + tsconfig.build × 5 + ai-runtime；DX audit 9 BLOCKER closed 6 (docs/audit/DX_RESPONSE.md) | npm install reality + 真 dist + 错误信息基础类 |
| API | 58 | **62** | 5 包 contract test 绿；dispose silent no-op 统一；intake 动词全栈统一 (b-4 + b-4b)；**BLOCKER-002 export * 8 内部 helper @internal 标记 (commit b-6 partial)** — typedoc / api-extractor 现在隐藏；runtime 移除留 0.2.0 | canonical Bar、KLineChartError、return convention、runtime export 实际收口 |
| 生态 | — | **65** | 21 个 framework binding (7×3) + sideEffects scope 修 + core 14 个 subpath exports + workspace:^ + LICENSE × 5 (commits c44f9a6, 291c4c4, 62d9dbb) | CHANGELOG/Changesets + 真 dist 验证 publint |
| 性能 | 45 | **65** | bench 套件落地 (commit tick-1)：14 benchmarks across 4 files；real numbers — Signal 13-17 ns; VP typical-price 100k bars 5.59 ms; OB applyDelta 68 ns; snapshot 33 µs; anchored zoom 19.5 ns; origin-shift 9.3 ns. 6/7 自定 target 达标，1 接近 (VP 100k 5.59 vs <5 ms 目标) | 继续优化命中目标 + GPU compute path 落地后回归保护 |
| 兼容性 | — | **50** | 5 包 peerDeps 合理（React 18/19, Vue 3.4+, Angular 17/18/19）；3 SSR 烟雾示例存在；examples 未跑过 | 浏览器矩阵 CI + SSR 实测 + WebGPU→WebGL fallback |
| 美学 | — | **30** | 无 design token；无主题系统；无视觉回归基线；不确定项 — 留待人判断 | design token + token-driven theme |
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
| B-3 | KLineChartError 错误基类 + 错误代码 + 迁移 54 处 throw | API | 35 | 中（错误生态长期收益） | M | MED | 所有 core throw 走 KLineChartError；error.code 枚举完整；测试覆盖 |
| B-4 | ~~5-动词 intake 统一~~ | — | — | — | — | **DONE** | 完成 tick 2, commit b-4 (5 controller 加 ingest/setData/append 别名 + @deprecated 老名) |
| B-4b | ~~adapter 侧暴露 canonical verbs~~ | — | — | — | — | **DONE** | 完成 tick 3, commit b-4b (18 method additions × 4 binding shapes × 3 frameworks; 实际是 4 binding shapes 不是 7) |
| B-5 | canonical Bar 类型（KLineData/OHLCV/BaseBar/AVWAPBar/VolumeProfileBar 统一） | API | 35 | 高（多处类型用到，对外稳定） | L | MED | 6 名字 → 1 (CanonicalBar) + 别名导出；Chinese stock domain 字段脱出 |
| B-6 | ~~`export *` 收口 (partial)~~ | — | — | — | — | **PARTIAL** | tick 4 commit b-6 partial: 8 helpers @internal 标记，typedoc/api-extractor 隐藏；runtime 移除留 0.2.0 |
| B-6b | runtime 移除 8 个 @internal helpers from root barrel | API | 18 | 中 | S | LOW (0.2.0) | 显式 re-export 不含 8 helpers；sub-path 仍可用；从 root barrel runtime 移除；major bump |
| B-7 | Demo / playground app（next-app 真实接入数据 + 渲染图表） | UX/美学 | 35/50 | 高（解锁 UX + 美学 + 视觉回归） | L | MED | examples/next-app 跑 binance ws → 真实 K 线 + 1 个指标 + crosshair |
| B-8 | ~~TV feature parity 矩阵~~ | — | — | — | — | **DONE** | tick 6, commit b-8 (252 行 / 113 in-scope / 8 pack 排好) |
| B-9 | MA family completion pack (ALMA/T3/ZLEMA/VIDYA/FRAMA/LSMA) | 组件完整性 | 12 | 中 | M | LOW (post-pack-A path open) | 6 indicators in src/core/indicators/ + scheduler register + tests |
| B-10 | Oscillator completion pack (StochRSI/AO/UO/DPO/Fisher/Schaff) | 组件完整性 | 12 | 中 | M | LOW | 6 indicators + tests |
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
