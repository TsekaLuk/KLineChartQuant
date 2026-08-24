# ADR-004：图表写操作采用乐观 revision、幂等与 turn 级撤销

- 状态：Accepted
- 日期：2026-08-23

## 背景

Agent 与用户共享同一张图表。模型可能重复发出同一个 tool call，IPC 可能重复投递，
用户也可能在 Agent 执行途中手动切换品种或删掉 Agent 正在更新的指标。

如果写操作只是"调用没抛异常就算成功"，就会出现 Agent 覆盖用户新状态、同一操作被
执行两次、或者 UI 显示"已完成"而图表其实没变的情况。

## 决策

三条机制同时生效：

**乐观 revision**。每次写操作携带它观察到的 `chartRevision`。若实际状态已经前进，
工具失败为 `STATE_CONFLICT`，由 Agent 重新读取后再规划，最多自动重试一次。

**幂等**。幂等键为 `sessionId/runId/toolCallId/toolVersion`。同一键重复执行返回首次
结果并标记 `idempotentReplay`，最多造成一次状态变化。并发的重复投递在进入 policy 与
Renderer 之前就被合并。

**turn 级撤销**。每个可逆写操作产生 `undoToken`；一个 Agent turn 内的多个写操作组成
undo group，按逆序撤销。撤销前校验 revision，陈旧的撤销失败为 `UNDO_CONFLICT`。

配套要求：工具成功的定义是**后置条件在 ChartController 状态中得到确认**，
`verifyPostcondition` 失败即判为 failure，不允许 Agent 声称完成。

## 后果

正面：

- 用户的手动操作不会被 Agent 静默覆盖。
- 重连、重复投递与模型重复调用都不会产生重复副作用。
- "已完成"在 UI 上有机器可验证的含义。

负面：

- 每个写工具都要实现后置条件校验，实现成本高于直接调用。
- 幂等记录需要持久化并有容量上限，跨重启的 replay 会返回已脱敏的结果快照。
- undo 状态保存在运行时内存中，应用重启后不再可撤销，只能靠用户手动恢复。

## 注意

`undoToken` 是本机撤销句柄而非凭证。它在 `redactValue` 中被显式豁免，否则会被
"token" 规则误判为密钥，导致审计轨迹缺失关键字段。新增豁免必须确认该字段永远不承载凭证。
