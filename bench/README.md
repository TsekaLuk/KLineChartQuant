# Render benchmark

该目录用于比较 Canvas2D、WebGL2 与 WebGPU 在**当前渲染架构**下的滚动成本。运行器使用系统已安装的 Chrome，不下载 Chromium，并在结束时删除临时浏览器 profile。

## 测什么

场景固定为「滚动一帧」：

- 蜡烛按屏幕坐标重算（与应用柱体投影一致，每帧量化到物理像素）；
- 指标线保留**数据空间**坐标（世界 x、价格 y），每帧只更新 `DataTransform`（滚动偏移 + 价格轴映射），由后端还原屏幕坐标；
- GPU 后端通过 `createSurface` 直出可见表面（应用主图当前使用的路径）；Canvas2D 直接写 2D 目标。

因此 `uploadsPerFrame` 应为 0，`paint` 时间反映滚动时的真实 CPU 成本。

## 运行

```powershell
node bench/run.mjs
```

默认 1180 x 640、DPR 2，可见 bar 数为 300 / 600 / 1,200 / 2,000 / 3,000 / 5,000 / 7,000 / 10,000，指标线为 3 条、12 条与 Ichimoku，每个场景预热 60 帧、采集 300 帧（2,000 bar 以上降到 120 帧）。结果写入 `bench/results/render-bench-local.json` 与 `.csv`。

### 一条命令出全套图

```powershell
pnpm bench:report                  # 全矩阵 + 异常点补测，然后生成全部图表
pnpm bench:report --charts-only    # 不重跑，只按现有 CSV 重画
```

`bench/report.mjs` 只负责编排：`run.mjs` → `plot.py` → `promo.py` → `promo.py --profile=ichimoku`。额外参数会原样转给 `run.mjs`，例如 `pnpm bench:report --bars=1200`。

单轮数据里明显高于两侧 bar 的孤立点（常见于 Canvas2D 遇到整机占用）会自动补测 2 次并取中位数，不需要手动重跑；补测进度以 `[stabilize]` 前缀输出。需要整体重复测量时用 `--rounds=N`：多轮的全部采样帧合并后统一取百分位，例如 `node bench/run.mjs --profiles=lines12 --rounds=3`；此时不再做异常点补测，设 `KLINE_BENCH_RETRIES=0` 可关闭补测。

逐点重跑（推荐，避免一次跑十几分钟）：

```powershell
node bench/run.mjs --bars=1200 --profiles=ichimoku --backends=webgpu
node bench/run.mjs --bars=10000 --profiles=lines12 --backends=webgl2,webgpu
```

`--bars` / `--profiles` / `--backends` 都接受逗号分隔；每次运行会与已有结果按 `backend + profile + bars` 合并，不会清掉之前测过的点。进度（场景序号、耗时）输出到 stderr，重定向 stdout 时也能实时看到。

## 环境变量

- `KLINE_BENCH_CHROME`：Chrome 可执行文件路径。
- `KLINE_BENCH_BARS`：逗号分隔的可见 bar 数。
- `KLINE_BENCH_WARMUP`：预热帧数。
- `KLINE_BENCH_FRAMES`：正式采样帧数。
- `KLINE_BENCH_ROUNDS`：同一场景重复轮数，全部采样帧合并后统一取百分位。
- `KLINE_BENCH_RETRIES`：异常点自动补测次数（默认 2）。
- `KLINE_BENCH_DPR`：设备像素比。

运行器会启动无头 Chrome，启用 GPU 并禁止软件光栅化；检测到 SwiftShader/llvmpipe 或 WebGL2/WebGPU 不可用时直接失败。

## 指标口径

- `cpuFramePreparationMs`：每帧重建柱体屏幕缓冲并构造 `DataTransform` 的 CPU 时间。
- `cpuFrameMs`：从调用绘制接口到返回的墙钟时间，包含批次处理、编码与 API/驱动调用；不代表 GPU 已完成。
- `frameIntervalP99Ms` / `onePercentLowFps`：最慢 1% 帧的间隔与对应帧率。
- `uploadsPerFrame` / `uploadedBytesPerFrame`：本帧实际发生的缓冲上传次数与字节数；数据空间折线在滚动时应保持为 0。
- `observedFps`：连续 rAF 间隔换算的帧率，受显示器刷新率上限约束。
- `droppedFrameRate` / `severeJankRate` / `longestDroppedFrameStreak`：分别对应超过 1.5 倍、2 倍刷新间隔的帧比例与最长连续掉帧。
- GPU 利用率与显存来自 Windows GPU Engine 计数器，仅用于同机相对比较。

## 绘图

```powershell
uv run bench/plot.py                      # 诊断图：paint P50 与 prepare + paint
uv run bench/promo.py                     # 宣传图：12 线 + Ichimoku
uv run bench/promo.py --profile=ichimoku  # 宣传图：只画 Ichimoku
```

两个脚本都读取 `bench/results/render-bench-local.csv`，在 CSV 同目录输出 `.png`：诊断图 `render-bench-local.png`，宣传图 `render-bench-local-promo.png`，单场景宣传图 `render-bench-local-promo-<profile>.png`。可传入其他 CSV 路径作为参数。帧率会被显示器刷新率封顶，帧生成时间不会。

## 限制

- 场景是合成几何，不挂载完整图表；Scene 的图层排序、文字合成与多 pane 不在计时范围内。
- 结果对机器负载敏感：运行前应关闭其他 Chrome 实例与 dev server，否则各后端都会出现明显抖动，数字不可比。

## 图表库对比

`bench/compare.mjs` 与上面的后端基准互补：它挂载**完整图表**，把 KCQ（WebGL2 / WebGPU / Canvas2D）与 Lightweight Charts、Apache ECharts、KLineChart 放进同一个页面、同一个无头 Chrome，各自经公开 API 绘制同一份数据并逐帧滚动。

```bash
pnpm bench:compare                         # 默认 150,500,1000 根、3 轮、每轮 600 帧
node bench/compare.mjs --rounds=5
node bench/compare.mjs --bars=500 --subjects=kcq-webgl,lightweight-charts
```

- **同一份数据**：`src/compare/impl/scene.ts` 是唯一事实来源，50,000 根固定种子的一分钟 K 线 + MA 5/10/20/30/60；各库都以 Vite 生产构建参测，KCQ 走工作区源码，MA 由内置脚本服务注册（与应用同一路径）。
- **同一个窗口**：KCQ 的 K 线宽度按整数物理像素取整，可见根数是离散的。运行器先用 `kcq-canvas` 把请求档位换成 KCQ 实际能取到的根数，其他库再缩放到同一根数；报告里 `requestedVisibleBars` 与 `visibleBars` 分别记录请求与实际档位。
- **同一个动作**：挂载后静置 30 帧、预热若干帧，再每帧向历史滚动一根；采样后核验实际滚动根数，偏差超过 3 根直接判无效。
- **主指标是 `mainThreadMsPerFrame`**：CDP `TaskDuration` 除以帧数，覆盖脚本、样式、布局与 GC；`mainThreadMsPerFrameRounds` 是逐轮值，轮间差异即本机噪声。GPU 进程的工作不计入。
- **页面内帧工作量（`frameWork*`）只作参考**：它测「滚动调用 + 本帧 rAF 内工作」，会漏掉库推迟到帧外的工作（KLineChart 在千根级时尤其明显），不能用来横向排名。
- **不比帧率**：macOS 上的无头 Chrome 把 rAF 固定在 60 Hz，解除帧率上限的开关不生效；帧间隔只用于统计掉帧。
- **场景按数据对齐，不按装饰对齐**：KCQ 与 KLineChart 额外绘制图例与极值标签，Lightweight Charts、ECharts 保持默认外观；每个场景首轮截图存到 `results/compare/`，供人工核对。
- 报告写到 `results/compare-local.json`（含逐帧原始数据）与 `.csv`；`git.dirty` 为真表示实测代码含未提交改动，对外发布前应提交后重跑。
