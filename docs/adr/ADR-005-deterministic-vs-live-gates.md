# ADR-005：确定性测试是 PR 门禁，真实模型测试独立运行

- 状态：Accepted
- 日期：2026-08-23

## 背景

Agent 行为依赖大语言模型，而模型输出天然带随机性。如果把真实 302.ai 调用放进 PR
门禁，会同时得到两个坏结果：偶发失败阻塞无关改动，以及为了让 CI 变绿而放宽断言。

同时，只跑确定性测试又无法回答"换成真实模型还能不能完成任务"。

## 决策

测试分成两条互不干扰的轨道。

**PR 门禁（`agent-ci.yml`）** 全部使用 Pi 的 scripted faux provider 与固定行情
fixture：静态检查、domain/contract 单元测试、agent-runtime 覆盖率门槛、
Playwright Electron E2E（`retries: 0`）、打包冒烟。四个 job 都是 required，
不允许 `continue-on-error`。

**真实模型评估（`provider-302ai-live.yml`）** 只在 `workflow_dispatch`、nightly 与
`v*-rc*` 标签上运行，使用仓库 secret `KQ_302AI_API_KEY`，产出脱敏报告。

断言口径也不同：确定性套件断言最终图表状态与工具轨迹；live 套件同样以工具轨迹和状态
为主，LLM judge 只作为辅助评分，且安全违规一票否决。

## 后果

正面：

- PR 结果可复现，失败即真实回归，不需要靠重跑掩盖。
- 真实模型的波动被隔离在夜间与发布候选阶段，通过多次运行做统计而不是单次判定。
- 普通 PR 不消耗真实 API 额度，也不需要把 Key 暴露给 fork 的工作流。

负面：

- Provider 侧的行为变化（模型下线、tool 格式变更）最快也要到下一次 nightly 才发现。
- 需要维护两套 fixture：faux 脚本与固定行情数据。

## 相关约束

`retries: 0` 是刻意的。出现 flaky 测试必须阻断或显式 quarantine 并绑定 issue 与
owner，不允许用重试把不稳定藏起来。live 套件的波动不计入 flaky 统计。
