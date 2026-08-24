# feat/renderer-interface 分支合入计划

> 调研日期：2026-06-26
> 分支：`feat/renderer-interface`（65 commits，689 文件变更）
> 基：`main`（`f1f91249e60`）

---

## 分支概览

| 维度 | 数据 |
|---|---|
| 提交数（超出 main） | 65 commits |
| 变更文件 | 689 个（+51,489 / -47,171 行） |
| 新增子系统 | 14 个 |
| 删除的旧代码 | `engine/`, `data-fetchers/`, `mcp/`, `vue/components/`（35 个 SFC）, `desktop-electron/` 等 |
| 测试增量 | ~610 个新测试（21 个测试文件），全部 vitest |

---

## 子系统分类

### A 类：纯新增、零冲突，可直接 Cherry-Pick

这些是 `packages/core/src/` 下全新的目录/文件，当前 main 中完全不存在。

| 子系统 | 位置 | 源文件 | 测试数 | 依赖 | 合入风险 |
|---|---|---|---|---|---|
| **Errors 错误体系** | `packages/core/src/errors.ts` + `errors-help.ts` | 2 | 27 | 无 | 低 |
| **Alerts 警报引擎** | `packages/core/src/alerts/` | 5 | 54 | `reactivity/signal` | 低 |
| **Replay 回放** | `packages/core/src/replay/` | 4 | 32 | `reactivity/signal` | 低 |
| **ChartTypes 替代 K 线** | `packages/core/src/chartTypes/` | 6 | 40 | 纯数学计算 | 低 |
| **Input 输入** | `packages/core/src/input/` | 3 | 42 | `reactivity/signal` | 低 |
| **Scheduler 帧调度** | `packages/core/src/scheduler/` | 3 | 49 | `reactivity/signal` | 低 |
| **Render 渲染接口** | `packages/core/src/render/` | 3 | 8 | TS 接口 | 低 |
| **Renderer-Tier 检测** | `packages/core/src/renderer-tier/` | 4 | 31 | WebGL 检测 | 低 |
| **Scale 坐标系** | `packages/core/src/scale/` | 6 | 44 | 纯数学 | 低 |
| **Scene 场景图** | `packages/core/src/scene/` | 4 | 25 | `render/` | 低 |
| **Indicators 新指标** | `packages/core/src/indicators/` | 14 | 32 | 纯数学 | 低 |
| **Components 组件模型** | `packages/core/src/components/`（6 个子系统） | 24 | 186 | `reactivity/signal` + `errors.ts` | 低 |
| — VolumeProfile | | 4 | 21 | | |
| — OrderBookHeatmap | | 7 | 41 | +WGSL 着色器文档 | |
| — Footprint | | 4 | 45 | | |
| — AnchoredVWAP | | 3 | 28 | | |
| — MTF Overlay | | 4 | 32 | | |
| — CrosshairSync | | 2 | 19 | | |
| **Bench 基准** | `packages/core/src/__bench__/` | 5 bench | 41 bench | 无 | 低 |
| **Vue Composables** | `packages/vue/src/composables/`（7 个） | 7 | 0 | 上述 core 控制器 | 低 |
| **React Hooks** | `packages/react/src/hooks/`（7 个） | 7 | 0 | 上述 core 控制器 | 低 |
| **Angular Bindings** | `packages/angular/src/bindings.ts` | 1 | 0 | 上述 core 控制器 | 低 |

**A 类总计**：~55 个新源文件，~610 个测试，全部 vitest。

---

### B 类：修改已有代码，需手动处理冲突

这些文件在 main 和 branch 都有，但 branch 做了改动：

| 文件 | 变更内容 | 冲突级别 |
|---|---|---|
| `packages/core/src/index.ts` | 删除 `./mcp`, `VERSION`, `formatTimestamp`, `generateUUID`；新增 14 个 barrel export | **高** — 不能直接删除现有导出 |
| `packages/core/src/controllers/createChartController.ts` | 967 行 → 521 行重写，去掉 engine/MCP/data-fetcher 依赖 | **极高** — 核心架构变更 |
| `packages/core/src/controllers/types.ts` | 接口大量简化，删除许多字段 | **高** |
| `packages/core/src/controllers/index.ts` | 导出完全改变 | **中** |
| `packages/core/src/controllers/createIndicatorSelectorController.ts` | 细微行为变更（name 非空、替换而非追加） | **低** |
| `packages/core/src/tokens/` | 删除 3 文件（theme-base, theme-china, colorPresetSettings）；暗色/亮色主题颜色值改变；删除大量颜色类型接口 | **已完成**，不在此计划范围内 |

---

### C 类：删除的代码

branch 删除但当前 main 仍有，**合入 branch 意味着删除**：

| 被删除的内容 | 说明 |
|---|---|
| `packages/core/src/engine/` | 整个旧引擎代码 |
| `packages/core/src/data-fetchers/` | 数据获取层 |
| `packages/core/src/mcp/` | MCP 协议层 |
| `packages/core/src/config/` | 配置文件 |
| `packages/core/src/plugin/` | 插件系统 |
| `packages/core/src/semantic/` | 语义配置 |
| `packages/core/src/types/` | 类型定义 |
| `packages/core/src/utils/` | 工具函数（部分移至根 `src/`） |
| `packages/core/src/version.ts` | 版本号 |
| `packages/vue/src/components/`（35 个 SFC） | 旧 Vue 组件 |
| `packages/desktop-electron/` | 桌面端 Electron |
| `examples/vue-test/` | 测试示例 |
| `packages/vue/preview/` | Vue 预览 app |

---

## 推荐合入批次

### 第 1 批：零风险基础设施

```
1. packages/core/src/errors.ts + errors-help.ts  (27 tests)
2. packages/core/src/input/                       (42 tests)
3. packages/core/src/scale/                       (44 tests)
4. packages/core/src/scheduler/                   (49 tests)
5. packages/core/src/render/                      (8 tests, interface only)
6. 更新 packages/core/src/index.ts — 新增导出，保留旧导出
```

- 纯新增代码，不修改现有逻辑
- 均可独立运行通过

---

### 第 2 批：独立业务功能

```
7.  packages/core/src/alerts/         (54 tests)
8.  packages/core/src/replay/         (32 tests)
9.  packages/core/src/chartTypes/     (40 tests)
10. packages/core/src/indicators/     (32 tests)
11. packages/core/src/renderer-tier/  (31 tests)
12. packages/core/src/scene/          (25 tests, 依赖 render/)
```

- 所有依赖已在第 1 批就绪

---

### 第 3 批：组件模型 + 框架绑定

```
13. packages/core/src/components/*    (186 tests)
    13a. volumeProfile
    13b. orderBookHeatmap
    13c. footprint
    13d. anchoredVwap
    13e. mtfOverlay
    13f. crosshairSync
14. packages/vue/src/composables/     (7 个文件)
15. packages/react/src/hooks/         (7 个文件)
16. packages/angular/src/bindings.ts  (1 个文件)
```

- 组件模型量大但纯新增
- 框架绑定适配器薄（每文件 ~55 行），依赖 core 控制器

---

### 第 4 批：Controller 重构

```
18. packages/core/src/controllers/ — ChartController 重写
    - createChartController.ts (967→521 行)
    - types.ts (接口简化)
    - index.ts (导出更新)
19. 根目录 src/ 的创建与迁移决策
```

- **极高风险** — 核心架构变更
- 涉及整个应用的架构重构
- 当前不推荐执行，建议等前 3 批稳定后再评估

---

## PR_SPLIT_GUIDE.md 团队决策

> 文档位置：`docs/PR_SPLIT_GUIDE.md`

- **决定**：接受 `#23 + #24` 作为 foundation drop，不再回溯拆分
- **Phase A（pre-merge）**：在 `feat/renderer-interface` 上继续迭代，不开新 PR
- **Phase B（post-merge）**：合入 main 后，每个 tick 以小 PR 形式提交

当前分支状态（最新 commit `6e54a34` B-28）显示团队仍处于 **Phase A**。

---

## 每个 A 类子系统的代码质量评分

| 子系统 | 源文件整洁度 | 测试覆盖度 | 边界情况 | 文档 |
|---|---|---|---|---|
| alerts | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（54 tests） | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| replay | ⭐⭐⭐⭐ | ⭐⭐⭐⭐（32 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| chartTypes | ⭐⭐⭐⭐ | ⭐⭐⭐⭐（40 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| components | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（186 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| indicators | ⭐⭐⭐⭐ | ⭐⭐⭐⭐（32 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| input | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（42 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| render | ⭐⭐⭐⭐⭐ | ⭐⭐⭐（8 tests, 接口契约） | ⭐⭐⭐ | ⭐⭐⭐ |
| renderer-tier | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（31 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| scale | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（44 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| scene | ⭐⭐⭐⭐ | ⭐⭐⭐⭐（25 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| scheduler | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（49 tests） | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| errors | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐（27 tests） | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 技术备忘

### Alerts 子系统关键设计点

- Predicate-based rule engine（10 种内置谓词 + custom 逃生口）
- `MarketSnapshot` 作为统一输入，支持 price/indicator/volume/order-book/footprint
- Per-rule prev-snapshot 实现交叉检测（首次不触发）
- Cooldown / oneShot / maxEvents bound
- 双重沙箱：custom 谓词在 predicates.ts 和 controller 里各有一层 try/catch
- 序列化拒绝 `kind:'custom'` — 明确 RCE 安全设计
- 54 tests，覆盖全部谓词正反案例 + schema roundtrip + controller 状态机

### Alerts 与当前 main 集成

```
createAlertController 依赖：reactivity/signal（main 已有） ✓
evaluatePredicate          ：纯函数，无依赖               ✓
serializeRule/deserializeRule：纯数据操作，无依赖           ✓
```

无任何架构依赖，**第 1 优先合入候选**。

---

## 执行记录

> 执行日期：2026-06-26
> 目标分支：`merge/category-a-pure-additions`（基于 `main` 创建）

### 执行范围

**一次性合入全部 A 类子系统**（第 1 批 + 第 2 批 + 第 3 批），共 **129 个新增文件 + 1 个修改文件**。

### 变更摘要

| 类型 | 文件 | 说明 |
|---|---|---|
| 新增 129 个 | `packages/core/src/errors.ts` + `errors-help.ts` | 错误体系 |
| | `packages/core/src/input/`（5 文件） | 手势识别 + 快捷键 |
| | `packages/core/src/scale/`（10 文件） | 坐标系 |
| | `packages/core/src/scheduler/`（3 文件） | 帧预算调度 |
| | `packages/core/src/render/`（4 文件） | 渲染接口契约 |
| | `packages/core/src/renderer-tier/`（6 文件） | GPU 后端检测 |
| | `packages/core/src/scene/`（6 文件） | 场景图 |
| | `packages/core/src/alerts/`（8 文件） | 警报引擎 |
| | `packages/core/src/replay/`（6 文件） | Bar 回放 |
| | `packages/core/src/chartTypes/`（10 文件） | 替代 K 线类型 |
| | `packages/core/src/indicators/`（16 文件） | 新指标 |
| | `packages/core/src/components/*`（50 文件） | 6 个组件模型 |
| | `packages/core/src/__bench__/`（5 文件） | 性能基准 |
| 修改 1 个 | `packages/core/src/index.ts` | **新增导出行，保留所有旧导出** |

### 未动代码

- **B 类**（`controllers/`, `tokens/`）— **未修改**
- **C 类**（已删除/迁移的代码）— **未删除**
- 所有现有测试、现有功能、现有 API 导出 — **完全保留**

### 测试验证

| 套件 | 文件 | 测试 | 结果 |
|---|---|---|---|
| `@klinechart-quant/core` | 94 文件 | 1563 passed | ✅ |
| `@klinechart-quant/vue` | 1 文件 | 6 passed | ✅ |
| `@klinechart-quant/react` | 1 文件 | 7 passed | ✅ |
| `@klinechart-quant/angular` | 1 文件 | passed | ✅ |
| `@klinechart-quant/ai-runtime` | 8 文件 | 117 passed | ✅ |

所有测试通过，零回归。

### 待办

| 优先级 | 事项 | 说明 |
|---|---|---|
| 低 | Vue composables·7 个 | 从 branch cherry-pick `packages/vue/src/composables/` |
| 低 | React hooks·7 个 | 从 branch cherry-pick `packages/react/src/hooks/` |
| 低 | Angular bindings | 从 branch cherry-pick `packages/angular/src/bindings.ts` |
| 待定 | B 类 Controller 重构 | 需评估 `createChartController.ts` 重写的影响 |
| 待定 | C 类代码删除 | 根目录 `src/` 迁移、旧组件清理等 |