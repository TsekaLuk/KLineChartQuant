# Agent Hardening - Technical Design

## 1. 外部导航与 URL 白名单（R1）

### 现状问题

`packages/desktop-electron/electron/main.ts`：

```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url)   // 任意协议、任意域名，直接交给系统
  return { action: 'deny' }
})
```

`{ action: 'deny' }` 只阻止了 Electron 内开新窗口，`shell.openExternal` 仍然把
未经解析的 URL 交给操作系统。同时没有 `will-navigate` 监听，主窗口可以被导航
到任意外部地址，从而绕过 CSP 与 preload 白名单。

### 方案

新增 `electron/external-navigation.ts`，把"是否允许"变成纯函数，与 Electron API 解耦：

```ts
export type ExternalLinkDecision =
  | { allowed: true; url: string }
  | { allowed: false; reason: ExternalLinkRejection }

export function decideExternalLink(rawUrl: string): ExternalLinkDecision
export function isApplicationOrigin(rawUrl: string): boolean
export function applyNavigationPolicy(webContents, options): void
```

规则：

- 用 `new URL()` 解析，解析失败即拒绝（`malformed`）。
- 协议必须是 `https:`；`http:`、`file:`、`javascript:`、`data:` 及自定义协议全部拒绝。
- host 必须精确等于 allowlist 条目，或是其子域；避免 `evil-302.ai` 这类后缀伪造。
- allowlist 集中在 `EXTERNAL_LINK_ALLOWED_HOSTS` 常量，不散落字面量。
- 应用自身来源（`file:` 打包页面与 `ELECTRON_RENDERER_URL` 开发源）由
  `isApplicationOrigin` 判断，只用于 `will-navigate` 放行，不用于外链放行。

纯函数便于在 vitest 里覆盖两侧分支，无需启动 Electron。
`applyNavigationPolicy` 负责把决策接到 `setWindowOpenHandler` 与 `will-navigate`，
拒绝时通过注入的 `openExternal` / `logger` 汇报，测试用假实现驱动。

## 2. 按 runId 导出审计 trace（R2）

### 数据来源

一次 run 的证据分布在三种持久化条目里：

| 条目 | 提供 |
|---|---|
| `kq.run.started` | runId、turnId、lane、readOnly、startedAt、retryOfRunId |
| `kq.run.terminal` | 终态 status、endedAt |
| `kq.ui.event`（run 范围） | 消息、工具卡片视图、usage、error |
| `kq.tool.trace` | toolVersion、chartRevision before/after、dataRevision、undoToken |

### 按 run 过滤的依据

`kq.tool.trace` 的顶层只有复合 `key`（`sessionId/runId/toolCallId/toolVersion`），
切分复合键会把键格式变成隐式协议。但它内嵌的 `result.meta` 就是
`ai-runtime` 的 `ToolResultMeta`，其中 `runId`、`toolCallId`、`toolVersion`、
`chartRevisionBefore/After`、`dataRevision`、`undoToken` 都是一等字段。

因此按 `result.meta.runId` 过滤即可，**不需要推进 `KQ_SESSION_SCHEMA_VERSION`**，
也不引入任何字符串解析或迁移风险。

### 导出结构

类型放在 `contracts/ui.ts`（Renderer 面向契约），不放在 `sessions/types.ts`，
避免让契约层反向依赖持久化层：

```ts
export interface AgentRunTraceExport {
  exportVersion: typeof KQ_TRACE_EXPORT_VERSION
  exportedAt: number
  sessionId: string
  runId: string
  turnId: string
  retryOfRunId?: string
  readOnly: boolean
  startedAt: number
  status: AgentRunStatus
  endedAt?: number
  usage?: AgentUsageView
  error?: AgentErrorView
  toolCalls: AgentRunTraceToolCall[]   // 视图 + toolVersion/revision/undoToken
  events: AgentUiEvent[]               // 该 run 的事件序列
}
```

`toolCalls` 把事件里的 `ToolCallView` 与 `kq.tool.trace` 的 meta 按 `toolCallId`
合并，得到 FR-013 要求的全部字段；有 trace 却没有事件的工具也会被导出，避免审计包
静默隐藏已执行的工具。所有内容在写入时已经过 `redactValue`，导出时再统一过一次。

### redaction 误伤修正

`redactValue` 的 `SECRET_KEY` 规则匹配任何含 `token` 的键名，把 `undoToken` 一并
打成 `[REDACTED]`。它是本机撤销句柄而不是凭证，且是 FR-013 明确要求的审计字段，
因此在 `NON_SECRET_KEYS` 中显式豁免，并保留 `accessToken` 一类仍被脱敏的行为。

### 暴露路径

`RuntimeSessionService.exportRunTrace(runId)`
→ `AgentApplicationService.exportRunTrace(runId)`
→ IPC 命令 `run.exportTrace`（payload `{ runId }`）
→ `preload.ts` 的 `nativeAgent.exportRunTrace`
→ `AgentBridgeClient.exportRunTrace`（`FakeAgentBridge` 同步实现）。

### 顺带修复：重启后 run 归属丢失

`AgentIpcRouter.assertOwnership` 要求 `runId` 命中 `runOwners`，而 `runOwners`
只在 `run.start` / `run.retry` 成功后写入。应用重启后 `session.open` 恢复出的
历史 run 不在表中，`run.retry`、`turn.undo`、新增的 `run.exportTrace` 都会被
误判为 `TARGET_MISMATCH`。在 `recordOwnership` 中把 `session.open` 返回快照里的
run 一并登记给该 sender，与既有 `session.list` 登记 session 的做法一致。

## 3. 覆盖率门禁（R3）

`packages/agent-runtime/vitest.config.ts` 增加 thresholds：

```ts
thresholds: { statements: 90, branches: 85, functions: 80, lines: 90 }
```

当前 statements 83.94% / branches 74%。补齐的测试针对真实未覆盖行为：
application service 的取消/失败/重试/provider 分支、redaction 的每条规则、
新增的外部导航策略与 trace 导出。

## 4. Agent required CI（R4）

新增 `.github/workflows/agent-ci.yml`：

| Job | 内容 |
|---|---|
| `agent-static` | frozen install、构建 core/ai-runtime/agent-runtime/vue、agent 相关包 typecheck、publint |
| `agent-unit-contract` | ai-runtime + agent-runtime + desktop 单元/契约测试，agent-runtime 覆盖率门槛 |
| `agent-electron-e2e` | `xvfb-run` 下的 Playwright Electron，faux provider，`retries: 0` |
| `agent-package-smoke` | `electron-builder --dir` 产物存在性与 preload/main 入口校验 |

四个 job 都不使用 `continue-on-error`。live 评估继续留在
`provider-302ai-live.yml`（workflow_dispatch + nightly），不进 PR 门禁。

## 5. 文档（R5）

- `docs/adr/ADR-001..006`：与 PRD 附录 A 一一对应。
- `docs/CI_GATES.md`：补一节说明 Agent required gate。

## 测试计划

| 层 | 用例 |
|---|---|
| L1 | `decideExternalLink` 放行/拒绝各协议与域名；`isApplicationOrigin` |
| L1 | redaction 每条规则分支，含 `undoToken` 豁免与 `accessToken` 仍脱敏 |
| L2 | `exportRunTrace` 合并事件与 tool trace meta；未知 runId 报错；注入密钥后导出脱敏 |
| L2 | `applyNavigationPolicy` 对 window-open 与 will-navigate 的行为 |
| L2 | IPC `run.exportTrace` 路由、ownership、payload 校验 |
| L2 | `session.open` 后历史 run 可被 retry/undo/export |
| L4 | Electron E2E：preload 暴露 `exportRunTrace`，导出结果含工具轨迹且无明文密钥 |
