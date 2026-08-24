# ADR-001：Pi Agent Runtime 位于 Electron 主进程

- 状态：Accepted
- 日期：2026-08-23

## 背景

KQ Agent Workbench 需要在桌面端运行一个持有 API Key、管理会话与工具循环的 Agent
运行时。可选位置有三处：Renderer 进程、主进程、或独立的 sidecar 进程。

Renderer 同时承载 KLineChart 的 canvas 渲染，任何长任务或网络等待都会与绘制争抢
UI 线程；而且 Renderer 是唯一直接消费不可信市场数据与模型输出的地方。

## 决策

Pi Agent Core 与 Pi AI 运行在 **Electron 主进程**（`packages/agent-runtime` +
`packages/desktop-electron/electron/`）。Renderer 只保留 Vue UI、ChartController
和经 preload 白名单约束的工具执行端。

两侧通过版本化的 typed IPC 通信：控制命令走 `ipcRenderer.invoke`，高频流式事件走
`MessageChannelMain`。preload 只暴露方法级白名单，不暴露原始 `ipcRenderer`。

## 后果

正面：

- API Key 只在主进程解密与使用，Renderer 只能拿到 `configured` 与 masked 指纹。
- Provider 网络调用与会话落盘不占用图表渲染线程。
- Renderer 即使被注入内容影响，能力上限也只是 preload 暴露的窄接口。
- 多窗口路由、取消、重试、审计和应用生命周期可以在一处统一处理。

负面：

- 引入进程边界带来的复杂度：序列化、协议版本、超时、目标校验都必须显式处理。
- 工具实际执行在 Renderer，需要 `RendererToolProxy` 与 `TARGET_GONE` 一类的生命周期错误码。
- 测试需要额外的 IPC 契约层与 fake proxy，不能只靠单进程集成测试。

## 备选方案

- **Renderer 内运行 Pi**：实现最简单，但 API Key 进入 Renderer，且长任务与渲染争抢线程，被否决。
- **独立 sidecar 进程**：隔离更彻底，但要自行管理进程生命周期与 IPC，收益不足以抵消成本，留待未来需要多实例时重新评估。
