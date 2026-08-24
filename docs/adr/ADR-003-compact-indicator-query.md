# ADR-003：指标查询保持 compact text，不反向解析

- 状态：Accepted
- 日期：2026-08-23

## 背景

`packages/core` 的 Agent 指标查询返回紧凑语义文本，而不是数值 DTO。这个设计是为了
压缩 token、统一不同指标的结果形态（纯数值、结构结果、zones、volume profile），
并避免把大数组直接塞进模型上下文。

桌面端接入时曾考虑把文本解析回结构化 DTO，让工具输出"看起来更规范"。

## 决策

`indicators.query` 工具**原样透传** core 返回的 compact text，禁止对它做 regex 或
Markdown 反序列化。工具输出用一层元数据外壳描述来源：

```ts
interface IndicatorQueryToolData {
  content: string // core 返回的紧凑语义文本，禁止反向解析
  definitionId: string
  requested: { from?: number; to?: number; limit: number; params: Record<string, number> }
  context: { symbol; market; period; dataSource?; timezone? }
  dataRevision: number
  durationMs: number
}
```

稳定入口是 `controller.agent.queryIndicator()`，桌面端不得穿透导入 `DataState` 或
内部 agent 文件路径。

## 后果

正面：

- 语义 formatter 变更不会连锁打碎解析器。
- 数字精度、空值与复合结构不会在"文本 → DTO"的往返中丢失。
- 上下文预算可控，不会因为一次查询把数千行塞进单轮对话。

负面：

- Agent 无法对查询结果做可靠的二次结构化计算，复杂分析要拆成多次工具调用。
- 测试断言以文本为准，需要额外注意不要把 formatter 的具体排版变成隐式契约。

## 未来演进

若确实需要结构化查询，应由 core **显式**新增双通道结果，而不是由 adapter 猜测：

```ts
{ content: string, structuredContent?: BoundedIndicatorResult }
```
