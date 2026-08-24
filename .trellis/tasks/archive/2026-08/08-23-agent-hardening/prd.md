# Agent Hardening And Release Gates

对应 `KLineChartQuant_Native_Agent_PRD_v1.0` 的 **PR-07 `test(agent-hardening)`**，
是 KQ Agent Workbench P0 的最后一个子任务。前六个子任务已交付并归档：
workspace UI、core agent facade、native Pi runtime、canonical tool registry、
agent chart tools、302.ai provider。

## Goal

把 Agent Alpha 从"功能可用"收敛到"可发布"：补齐 PRD 中仍缺失的安全边界、
审计导出能力、覆盖率门禁、CI required gate 与架构决策文档。

## 现状审计（2026-08-24 基线）

已经落地、无需重做的部分：

- IPC sender / protocolVersion / windowId / chartId 校验（`agent-ipc.ts`、`agent-ipc-router.ts`）。
- Renderer reload、window close、MessagePort 关闭触发 `interruptOwnedRuns()`（FR-015 生命周期部分）。
- `TARGET_GONE` / `TARGET_MISMATCH` 目标校验（`chartToolHost.ts`、`preload.ts`）。
- Renderer CSP、`contextIsolation` / `nodeIntegration:false` / `sandbox:true`。
- 密钥仅存于 Main + `safeStorage`；Renderer 只能拿到 `configured` 与 masked 指纹。
- `redactString` / `redactValue` 脱敏原语。
- 包测试全绿：core / ai-runtime / agent-runtime(63) / vue(79) / desktop(14) / react / angular。

仍然缺失的部分即本任务范围。

## Requirements

### R1 — 外部导航与 URL 白名单（PRD §14.1、§17.6）

`main.ts` 当前对 `setWindowOpenHandler` 收到的任意 URL 直接调用
`shell.openExternal(url)`，没有 URL parser 与协议/域名 allowlist，也没有
`will-navigate` 限制。渲染进程一旦被注入内容影响，即可触发
`file:` / `javascript:` / 自定义协议的外部打开，或把主窗口导航离开应用。

- 外链必须经过显式 URL 解析，仅放行 `https:`（以及 `http:` 的本地开发源）。
- 域名必须命中 allowlist，未命中一律拒绝并记录，不静默放行。
- 主窗口 `will-navigate` 只允许应用自身来源；其余一律阻止并按外链策略处理。
- 协议、域名、开发源等常量集中声明，禁止散落字符串字面量。

### R2 — 按 runId 导出审计 trace（PRD FR-013 "日志支持按 runId 导出"）

当前 `RuntimeSessionService` 只有 `listToolTraces(sessionId)`，无法按 run 导出，
桌面端也没有导出入口。

- 新增按 `runId` 汇总的导出：run 元信息、终态、工具调用轨迹、usage、错误码。
- 导出内容统一走 redaction，不含 API Key、Authorization、原始隐藏思维链、本机绝对路径。
- 通过 application service → IPC → preload bridge 暴露为窄接口方法。
- 导出结构带 schema version，便于后续迁移。

### R3 — 覆盖率门禁（PRD §16.4）

`packages/agent-runtime` 当前 statements 83.94% / branches 74%，且
`vitest.config.ts` 未配置 thresholds，覆盖率回退不会让 CI 变红。

- 配置 thresholds：statements ≥ 90%、branches ≥ 85%。
- redaction 分支覆盖 100%。
- 通过补齐真实行为测试达标，禁止为凑数字测试无意义 getter。

### R4 — Agent required CI gate（PRD §20.1）

仓库现有 `library-ci.yml` 的 build/type/publish 检查全部 `continue-on-error`，
没有任何 Agent 专属 required gate。

- 新增 `.github/workflows/agent-ci.yml`，包含 `agent-static`、
  `agent-unit-contract`、`agent-electron-e2e`、`agent-package-smoke` 四个 job。
- 四个 job 均不得使用 `continue-on-error`。
- Electron E2E 在 Linux + Xvfb 下运行，`retries: 0`，使用 faux provider。
- live 302.ai 评估保持独立 workflow，不进入 PR 门禁。

### R5 — 架构决策与发布文档（PRD 附录 A、§22 DoD）

PRD 附录 A 列出的 ADR-001..006 尚未落地为仓库文档。

- 在 `docs/adr/` 记录六条 ADR，说明背景、决策、后果。
- 更新 `docs/CI_GATES.md`，说明 Agent required gate 与既有 warn-only gate 的关系。

## Acceptance Criteria

- [x] `file:`、`javascript:`、未知自定义协议、非 allowlist 域名的外链一律不触发 `shell.openExternal`。
- [x] 主窗口对外部来源的 `will-navigate` 被阻止，应用自身页面不受影响。
- [x] 外部导航策略有独立单元测试，覆盖放行与拒绝两侧分支。
- [x] 可按 `runId` 导出 trace，内容包含工具轨迹与 run 终态，且经过 redaction。
- [x] 导出接口经 preload 窄桥暴露，未泄漏 raw `ipcRenderer`。
- [x] 注入了密钥、Authorization、隐藏思维链、本机路径的 trace 导出后不含明文。
- [x] `pnpm --filter @363045841yyt/klinechart-agent-runtime coverage` 达到 statements 92.4% / branches 85.58%，低于阈值时命令失败。
- [x] `.github/workflows/agent-ci.yml` 存在且四个 job 无 `continue-on-error`。
- [x] `docs/adr/` 包含 ADR-001..006；`docs/CI_GATES.md` 反映新门禁。
- [x] 全量包测试、涉及包的 type-check、lint 与 Electron E2E 通过。

## Non-Goals

- 不实现 P1 项：会话导出为 Markdown、双向定位、批量重做、费用可视化。
- 不运行真实 302.ai live 评估（需要 `KQ_302AI_API_KEY`，不在本地环境注入）。
- 不修复仓库既有的 root type-check / root lint 历史债务（与 Agent 无关的部分）。
- 不做真实交易执行相关的任何能力。
