# Agent Hardening - Verification

## Result

PR-07 的五项收敛需求全部落地：外部导航白名单、按 runId 的脱敏审计导出、
agent-runtime 覆盖率门禁、四个 required 的 Agent CI job，以及 ADR-001..006。
KQ Agent Workbench P0 的全部子任务至此完成。

## Passing Gates

| 命令 | 结果 |
|---|---|
| `pnpm test:packages` | core 194 文件 / 2240 用例；ai-runtime 14/152；agent-runtime 11/113；vue 15/79；desktop 4/29；react 1/2；angular 12 通过 + 1 todo |
| `pnpm --filter …agent-runtime coverage` | statements 92.4%、branches 85.58%、functions 95.08%、lines 94.08%，全部高于阈值 |
| `redaction.ts` 覆盖率 | statements / branches / functions 均为 100% |
| `pnpm --filter …desktop test:e2e` | Playwright Electron 2 passed，`retries: 0` |
| `pnpm --filter …desktop test:smoke` | 生产构建产物 4 项入口校验通过 |
| `pnpm --filter …desktop typecheck` | 通过 |
| `pnpm docs:check` | README 全部最新 |
| 任务范围 ESLint（`--max-warnings=0`）与 Prettier | 通过 |

## 相对基线的净增测试

- agent-runtime：63 → 113 个用例（新增 renderer-tool-proxy 生命周期、application
  service 失败/重试/关闭路径、Provider malformed 边界、设置持久化边界、trace 导出）。
- desktop：14 → 29 个用例（新增外部导航策略、`run.exportTrace` 路由与归属）。

## 修复的既有缺陷

- `AgentIpcRouter` 只在 `run.start` / `run.retry` 时登记 run 归属，应用重启后
  `session.open` 恢复出的历史 run 会在 retry / undo 时被误判为 `TARGET_MISMATCH`。
  现在 `session.open` 会把快照里的 run 一并登记给该 sender。
- `redactValue` 把 `undoToken` 当成凭证脱敏，导致审计轨迹缺少撤销句柄。已显式豁免，
  `accessToken` 等真实凭证仍然脱敏。
- `shell.openExternal` 接受任意协议与域名，`will-navigate` 完全没有限制。

## 302.ai Live Evaluation（2026-08-24 已执行）

以 `gpt-5.6-luna` 运行 `live:302ai`，3 次重复，全部通过 catalog / text completion /
tool-call 三层探测：

| 项 | 值 |
|---|---|
| status | `completed` |
| modelId | `gpt-5.6-luna`（evidence `current-unranked`） |
| compatible | `true`，3/3 次通过 |
| medianLatencyMs | 8056 |
| medianTtftMs | 3522 |
| failures | 空 |
| catalogSize | 969（非 legacy 929） |

结论：`gpt-5.6-luna` 在 302.ai 上可用且是 Agent compatible（第 3 层 tool-call 探测通过）。
延迟偏高，作为"fast candidate"需要在真实交互中再评估，但不影响功能门禁。

### 发现：arena priors 与 302.ai 目录零重叠

对 929 个非 legacy 目录条目做 `findArenaPrior` 匹配，命中数为 **0**：

- `gemini-3.7-flash-high` — 目录只有 `gemini-3.7-flash`
- `gemini-3-flash` — 目录只有 `gemini-3-flash-preview`
- `gpt-5.6-luna-xhigh` — 目录中不存在

`rankProviderParetoFrontier` 只接收 `arenaOverallRank !== null` 的评估，因此针对
302.ai 时 `paretoModelIds` 恒为 `[]`。这是精确 ID 证据规则的**正确结果**，不是 bug：
把 `gpt-5.6-luna-xhigh` 的 rank 63 套到 `gpt-5.6-luna` 上正是规范明令禁止的行为。
但空数组在报告里语义含糊（"评估过但无优势" vs "没有可比证据"），已记入待办。

### 凭据处置

Key 只存在于一次性 shell 会话的环境变量中，运行后立即 `unset`。已验证：
生成的报告与目录响应均不含 Key，工作树与全部 git 历史（`git log --all -S`）
均无匹配。临时文件已删除。

## Explicitly Not Run

- 三平台打包冒烟：本地只验证了 macOS 上的 `electron-vite build` 产物；Windows /
  Linux 由 CI 承担。
- PRD §19 的黄金场景 live 评估（`C_state` / `C_tool` / `C_evidence` 打分）尚无脚本
  实现；当前 `live:302ai` 覆盖的是 §13.3 的三层连接探测，不是完整的场景套件。

## Existing Repository Baselines

- 根 `pnpm type-check` 与根 `pnpm lint` 仍有与 Agent 无关的历史债务，未在本任务内处理；
  变更涉及的包各自独立通过 typecheck 与 scoped lint。
- `docs/CI_GATES.md` 原本就不在 `pnpm format` 的覆盖范围内（该脚本只处理 `packages/`），
  因此本次编辑沿用文件既有的表格排版，未引入无关的 Prettier 重排。
