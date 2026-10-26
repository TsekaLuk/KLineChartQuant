/**
 * 图表库对比基准的对外契约：被测适配器接口、确定性数据集与页面侧单场景结果。
 * 页面（main.ts）只依赖这些契约；各库适配器在 impl/ 中实现。
 */

/** 被测对象：KCQ 的三个渲染后端各算一个，竞品按库区分。 */
export type SubjectId =
  | 'kcq-webgl'
  | 'kcq-webgpu'
  | 'kcq-canvas'
  | 'lightweight-charts'
  | 'echarts'
  | 'klinecharts'

/** 被测对象的身份；报告用 packageName 读取实际参测版本。 */
export interface SubjectInfo {
  readonly id: SubjectId
  readonly library: string
  readonly packageName: string
  readonly renderer: string
}

/**
 * 一根分钟 K 线；字段与各库的 OHLCV 输入同形，适配器不需要转换对象。
 * 用 type 而非 interface：klinecharts 的 KLineData 带索引签名，只有类型别名能结构兼容。
 */
export type BenchBar = {
  readonly timestamp: number
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number
}

export interface BenchDataset {
  readonly bars: readonly BenchBar[]
  readonly maLines: MaLineCount
  readonly maPeriods: readonly number[]
  /** 与 maPeriods 一一对应的收盘价简单移动平均；窗口未满处为 null。 */
  readonly ma: readonly (readonly (number | null)[])[]
}

/** 主图叠加的均线条数档位；周期表见 impl/scene.ts 的 MA_LINE_SETS。 */
export type MaLineCount = 5 | 12

/** 当前可见的逻辑索引区间；各库端点约定略有差异，只用于计数与滚动核验。 */
export interface VisibleRange {
  readonly from: number
  readonly to: number
}

/** 被测图表库适配器：只走库的公开 API，与库的普通用户写法一致。 */
export interface ChartSubject {
  /** 挂载到固定尺寸容器，写入整份数据与 MA，并缩放到目标可见根数。 */
  mount(container: HTMLElement, dataset: BenchDataset, visibleBars: number): Promise<void>
  /** 通过库的公开 API 向历史方向平移一根 K 线。 */
  scrollOneBar(): void
  visibleRange(): VisibleRange
  destroy(): Promise<void>
}

/** 注册表条目：静态身份 + 按需创建适配器。 */
export interface SubjectEntry {
  readonly info: SubjectInfo
  readonly create: () => ChartSubject
}

export interface CompareScenarioOptions {
  subject: SubjectId
  visibleBars: number
  maLines: MaLineCount
  width: number
  height: number
  warmupFrames: number
  sampleFrames: number
}

/** 挂载阶段结果：挂载耗时与缩放后实际可见根数。 */
export interface PreparedScenario {
  mountMs: number
  actualVisibleBars: number
}

/**
 * 采样阶段结果。
 * frameWorkMs：每帧同步滚动调用 + 本帧排在测量回调之前的 rAF 工作（各库在 rAF 里绘制），不受刷新率封顶影响；
 * frameIntervalsMs：相邻 rAF 间隔，用于统计显示刷新下的掉帧。
 */
export interface SampledScenario {
  frameWorkMs: number[]
  frameIntervalsMs: number[]
  scrolledBars: number
  jsHeapUsedBytes: number | null
}
