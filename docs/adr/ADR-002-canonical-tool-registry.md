# ADR-002：单一 Canonical Tool Registry，Pi 与 MCP 都是适配器

- 状态：Accepted
- 日期：2026-08-23

## 背景

图表能力需要同时服务两类调用方：进程内的第一方 Pi Agent，以及通过 MCP 连接的外部
客户端。若两侧各自维护 schema 与权限判断，很快就会出现"MCP 能做但 Agent 不能"或者
两侧校验强度不一致的问题。

Pi 官方 SDK 本身不内置 MCP。一种诱人的做法是让第一方 Agent 通过本机 WebSocket/stdio
连回自己的 MCP server，从而"只有一条路径"。

## 决策

工具定义集中在 `packages/ai-runtime` 的 canonical registry：每个工具声明 version、
input/output schema、safety、confirmation、timeout、reversible、execution mode 与
capability 探测。

Pi Adapter 与 MCP Adapter 都**从同一份 registry 生成**，不手写两套 schema。第一方
Agent 直接进程内调用 registry，不经过本机 MCP loopback。

```text
Canonical Tool Registry
  ├─ Pi Adapter（第一方、进程内编排）
  └─ MCP Adapter（外部客户端协议）
```

## 后果

正面：

- 同一输入在两个 adapter 上得到相同的 validation、policy 与 domain result，可用 parity 测试锁定。
- 未实现的能力（alert/replay）只要不在 registry 注册，两侧就都看不到，不会形成假闭环。
- schema snapshot 可以检测契约漂移，破坏性变更必须显式升 tool version。

负面：

- registry 成为跨包的核心依赖，任何新增工具都要同时考虑两个 adapter 的表现。
- 外部 MCP 路径不再是第一方的生产路径，需要单独保留 black-box parity 测试来防止它腐化。

## 备选方案

- **第一方 Agent 走本机 MCP loopback**：路径统一，但引入双重序列化、本地端口与重连故障，
  并且让 E2E 难以区分 domain failure 与 transport failure，被否决。
- **两套独立 schema**：短期最快，长期必然漂移，被否决。
