# Architecture Decision Records

每条 ADR 记录一个已经生效的架构决策：为什么这么选、放弃了什么、以及后续要付出的代价。
决策变化时新增一条 ADR 并把旧条目标为 Superseded，不要就地改写历史。

| ID                                                | 标题                                               | 状态     |
| ------------------------------------------------- | -------------------------------------------------- | -------- |
| [ADR-001](ADR-001-pi-runtime-in-electron-main.md) | Pi Agent Runtime 位于 Electron 主进程              | Accepted |
| [ADR-002](ADR-002-canonical-tool-registry.md)     | 单一 Canonical Tool Registry，Pi 与 MCP 都是适配器 | Accepted |
| [ADR-003](ADR-003-compact-indicator-query.md)     | 指标查询保持 compact text，不反向解析              | Accepted |
| [ADR-004](ADR-004-revision-idempotency-undo.md)   | 图表写操作采用乐观 revision、幂等与 turn 级撤销    | Accepted |
| [ADR-005](ADR-005-deterministic-vs-live-gates.md) | 确定性测试是 PR 门禁，真实模型测试独立运行         | Accepted |
| [ADR-006](ADR-006-no-trading-side-effects.md)     | Agent Alpha 不产生真实交易副作用                   | Accepted |

来源：`KLineChartQuant_Native_Agent_PRD_v1.0` 附录 A。
