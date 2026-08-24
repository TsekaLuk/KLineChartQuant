# @klinechart-quant — 后期详细技术方案

> 范围：v0(core + react/vue/angular 三框架壳 + 5 组件 + npm 发布)已完成。本文档是 v0 之后的详细技术设计，落到具体架构分层、具体轮子选型与替代品取舍、数学模型推导、关键 trade-off。
>
> 重心是 P1(WebGPU renderer 与三个差异化组件)，写到可直接动手的深度；P2–P4 给到实现级架构与选型深度。

读者：CTO、渲染引擎负责人(作者)、产品与模型负责人(你)、AI Coding Agent。

---

## 0. 全局架构：core 怎么分层

在展开任何一个阶段之前，我们需要先把 `@klinechart-quant/core` 的内部分层讲清楚，因为后面四个阶段全部是往这张骨架上横向挂东西，而不是动骨架本身。理解了这张骨架，你就能理解为什么每个新能力都能"加进去而不推翻"。

core 内部分成七个子模块，它们之间是单向依赖的。最底下是 `store`，一个框架无关的响应式状态容器，它持有图表的全部状态——可见时间范围、价格范围、指标列表、绘图对象、布局。它之上是 `scale`，负责坐标系——把时间和价格映射到屏幕像素，这是整个图表的数学核心。再往上是 `data`，负责数据的获取、维护(尤其是 order book 这种需要增量维护的结构)和列式存储。`compute` 负责指标和聚合计算，它会用到 `data` 提供的数据。`scene` 是场景图，把图表抽象成一组 layer(K 线层、成交量层、指标层、绘图层、十字光标层)。`render` 是渲染层，定义了一个抽象的 `Renderer` 接口，然后有 `WebGLRenderer` 和(P1 之后的)`WebGPURenderer` 两个实现。最上面是 `interaction`，处理鼠标键盘触摸，把用户操作翻译成对 `store` 的修改。

```
interaction  (pan / zoom / crosshair / picking)
     │  改 store
     ▼
   store  (响应式状态：可见范围、指标、绘图、布局)
     │  被订阅
     ▼
   scene  (layer 列表：candle / volume / indicator / drawing / crosshair)
     │  用 scale 算坐标，用 render 画
     ├──► scale   (TimeScale / PriceScale，linear & log)
     ├──► data    (DataSource / OrderBook / Arrow 列存)
     ├──► compute (指标 runtime / GPU 聚合)
     └──► render  (Renderer 接口 → WebGLRenderer | WebGPURenderer)
```

这个分层里最关键的设计是：**`render` 是一个接口，不是一个实现**。v0 里它只有 `WebGLRenderer`，P1 加 `WebGPURenderer`，两者实现同一个接口。`scene` 只知道"我有一组 layer，每个 layer 调 renderer 的 `drawInstances`、`drawLines`、`dispatchCompute` 这些方法"，它完全不知道底下是 WebGL 还是 WebGPU。这就是横向扩展能成立的结构基础——换渲染后端，`scene` 以上一行不改。

三个框架壳(react/vue/angular)的职责到这里也就清楚了：它们只做两件事，一是在组件挂载时创建 core 实例并把 DOM 容器交给它，二是当 props 变化时调用 core 的命令式方法。所有逻辑都在 core，壳是几十行的胶水。这一点必须像宪法一样守住，因为一旦有人为了图方便在 React 壳里写了一段业务逻辑，Vue 和 Angular 用户就立刻拿不到这个功能，全生态承诺当场破产。

---

## 1. 坐标系的数学模型(所有图表的地基)

在讲渲染之前必须先把坐标系讲透，因为这是金融图表区别于普通可视化、也是 klinecharts 这类库手感做不好的根本原因。我们先建立直觉，再写公式。

### 1.1 为什么 X 轴用 bar index 而不是时间戳

一个新手会很自然地想：X 轴是时间，那 `x = (t - t_start) / (t_end - t_start) * width` 不就行了吗？这在普通时间序列里对，但在金融图表里错得离谱。原因是金融市场有非交易时段——周末、夜盘休市、停牌、节假日。如果用真实时间戳做线性映射，周五收盘到周一开盘之间会出现一大段空白，K 线之间的间距会忽宽忽窄，交易员看着会很难受，因为他们的肌肉记忆是"每根 K 线等宽"。

所以专业图表的 X 轴实际上是**离散的 bar 序号**，不是连续时间。第 0 根 K 线、第 1 根、第 2 根……等间距排列，时间只是每根 K 线附带的标签。映射公式是：

```
x(i) = (i - firstVisibleIndex) * barWidth + leftPadding
```

其中 `i` 是 bar 的全局序号，`firstVisibleIndex` 是当前视口最左边那根 K 线的序号(可以是小数，因为可以滚动到"半根"位置)，`barWidth` 是每根 K 线占的像素宽度(缩放就是改这个值)。这个设计带来一个副作用：时间轴的刻度标签需要反过来从 bar index 查时间戳，而且因为时间不连续，刻度不能均匀分布，要在"自然时间边界"(每天开盘、每周一、每月一号)处打标签。这部分逻辑是时间轴做得专不专业的分水岭，KLineQuant 已经处理了，这是它的隐性资产。

这里有一个 **trade-off** 值得点明：bar-index 方案让 K 线等宽、手感好，但牺牲了"时间是连续维度"这个性质。如果将来要做跨周期对齐(比如把 1 分钟图和日线图按真实时间对齐叠加)，bar-index 就会很别扭，需要额外的时间→索引映射层。对于纯 K 线展示，bar-index 是正确选择；对于多资产时间对齐分析，需要在 `scale` 里额外维护一个 wall-clock 模式。建议 v0 之后保持 bar-index 为默认，把 wall-clock 模式作为 `TimeScale` 的一个可选 mode，而不是替换。

### 1.2 价格轴：线性与对数

Y 轴把价格映射到像素。线性模式很直接，价格 `p` 在可见范围 `[pMin, pMax]` 内的位置是：

```
y(p) = height - (p - pMin) / (pMax - pMin) * height
```

注意减法是因为屏幕坐标 Y 向下增长，而价格向上增长，要翻转。

对数模式是金融图表的必备项，因为长期价格图(比如比特币从 100 美元到 10 万美元)在线性轴上早期的波动会被压成一条平线，看不出结构。对数轴让"百分比变化"在视觉上等距：

```
y(p) = height - (ln(p) - ln(pMin)) / (ln(pMax) - ln(pMin)) * height
```

KLineQuant 的 changelog 里提到它在 v0.5.6 做了"对数坐标轴像素级均布网格线"，这说明作者已经踩过这里的坑——对数轴的网格线不能均匀分布，要在 `10^k` 这样的自然边界上放刻度，否则网格会乱。这又是一块隐性资产。

### 1.3 缩放锚点的数学(手感的核心)

为什么 TradingView 的缩放手感好，而很多开源库缩放时图表会"跳"？核心在于缩放锚点。当用户在某个鼠标位置 `mouseX` 滚轮缩放时，正确的行为是：**鼠标指向的那个数据点，在缩放前后必须停留在同一个屏幕像素上**。这叫 anchored zoom。

数学上，设缩放前鼠标处对应的 bar index 是 `i_anchor`(通过 1.1 的逆运算求得)，缩放是把 `barWidth` 乘以一个因子 `k`(滚轮上滚 k>1 放大，下滚 k<1 缩小)。缩放后我们要解出新的 `firstVisibleIndex'`，使得 `i_anchor` 仍然落在 `mouseX`：

```
缩放前：  mouseX = (i_anchor - firstVisibleIndex)  * barWidth  + leftPadding
缩放后：  mouseX = (i_anchor - firstVisibleIndex') * barWidth' + leftPadding
其中     barWidth' = barWidth * k

两式相等，解出：
firstVisibleIndex' = i_anchor - (mouseX - leftPadding) / barWidth'
```

这个公式保证锚点不动。KLineQuant 的 roadmap 第一条就是"K-line zoom anchor stability"，说明这是作者明确攻克过的点。价格轴的缩放锚点同理。这种细节做不到，用户一缩放就觉得"廉价"，而它恰恰是纯数学问题，没有捷径，只能一个个公式推对。

---

## 2. P1 — WebGPU Renderer(渲染代差)

这是 v0 之后第一个、也是最硬的一块。目标是在保留现有 WebGL renderer 作为 fallback 的前提下，横向加一个 WebGPU renderer，把 WebGL 打不动的极限密度场景(百万级 tick replay、L2 heatmap、footprint)拿下。

### 2.1 为什么 WebGPU 能做 WebGL 做不到的事

要让你和作者都认同"值得花这个力气"，得先讲清楚 WebGPU 的代际优势到底在哪，而不是泛泛地说"更快"。有三个具体的、WebGL 结构上给不了的能力。

第一是 **compute shader**。WebGL 只有 vertex shader 和 fragment shader，它的设计是"渲染管线"，你不能用它做通用并行计算。如果你想在 GPU 上做"把一百万笔成交按价格分桶求和"这种聚合，WebGL 时代的做法是用 fragment shader 玩各种 hack(把数据编码进纹理，用 blending 做累加)，又慢又难维护。WebGPU 有真正的 compute shader，你可以写一个 WGSL kernel，直接对一个 buffer 做并行 reduce。这让 volume profile、heatmap binning、footprint 聚合这些计算从 CPU 卸载到 GPU，这是质变。

第二是 **storage buffer 的灵活读写**。WebGL 的 shader 只能读纹理、读顶点属性，不能随机读写一个大数组。WebGPU 的 compute shader 可以对 storage buffer 随机读写，这让"维护一个百万级的环形 tick buffer 并在 GPU 上处理"成为可能。

第三是 **更低的 draw call 开销和更现代的资源绑定模型**。WebGPU 的 bind group、pipeline 是预编译的，每帧的状态切换成本远低于 WebGL 的命令式状态机。在需要画很多 layer、很多 pass 的复杂图表里，这个差异会累积成可感知的帧率差。

明确这三点之后，P1 的边界也清楚了：**WebGPU renderer 不是要替换 WebGL renderer 在普通 K 线场景的角色**——WebGL 在那里已经 200fps，够了。WebGPU 是专门用来吃那些"需要 GPU 通用计算 + 大 buffer 随机读写"的高密度场景。两个 renderer 各有主场，这正是"横向"的体现。

### 2.2 用什么轮子，以及为什么不用别的

这是你要的"具体轮子"。WebGPU 这一层的选型有几个真实的岔路口。

底层 API 上，**直接用原生 WebGPU API**，不要套 three.js。three.js 是为 3D 场景设计的，它的 Object3D、材质系统、场景图对一个 2D 金融图表是纯粹的负担，会带进来几百 KB 的你用不上的代码，而且它的抽象会挡在你和 GPU 之间，让你想做的底层优化(比如自定义的环形 buffer)很难落地。金融图表本质是大量 2D 实例化矩形和线，直接写 WGSL 反而更简单、更可控。

但原生 WebGPU API 非常啰嗦，创建一个 buffer、写一个 uniform 要写很多样板代码。这里推荐用一个极薄的工具层 **`webgpu-utils`**(greggman 维护的小库)，它把 buffer 创建、uniform 布局、typed array 视图这些样板封装掉，但不引入任何抽象。它的定位类似于"WebGPU 的 lodash"，帮你省样板，但不挡路。替代品 `TypeGPU` 更激进地用 TypeScript 类型描述 GPU 资源，类型安全更好，但它还年轻、API 在变，对一个要长期维护的核心库来说风险偏高，可以观望但 v0 之后这个阶段先不押注。

矩阵和向量运算，2D 图表几乎用不到 4x4 矩阵，坐标变换就是上面 §1 那几个一维线性映射，放在 uniform 里传给 shader 即可，**不需要 gl-matrix**。引入它只会增加心智负担。

颜色映射(heatmap 要用)推荐用 **`d3-interpolate` 和 `d3-scale-chromatic`** 这两个小模块。它们提供了经过视觉科学验证的色阶(比如 viridis、inferno 这种感知均匀的色阶)，自己手调 RGB 插值几乎不可能调得这么好。注意只引入这两个子模块，不要引入整个 d3，d3 是模块化的，可以按需安装 `d3-scale-chromatic` 单独一个包。

**trade-off 总结**：原生 WebGPU + webgpu-utils 的组合，代价是代码量比用 three.js 多、需要团队真正理解 GPU 管线；收益是完全的控制力和最小的包体积。对一个要做到"超越 TradingView 渲染"的核心库，这个控制力是必须的，不能为了省事把命脉交给一个通用 3D 引擎。

### 2.3 K 线的 GPU 渲染：实例化的数学

讲一个具体例子，让架构落地。怎么在 GPU 上画一百万根 K 线？

核心技术是 **instanced rendering(实例化渲染)**。一根 K 线由三部分组成：一个矩形实体(body，从开盘价到收盘价)和上下两根影线(wick，从实体到最高价、最低价)。如果你为每根 K 线生成完整的顶点数据上传，一百万根就是几百万个顶点，内存和带宽都爆炸。实例化的思路是：只定义**一个**单位矩形的几何(四个顶点)，然后告诉 GPU"画这个矩形一百万次，每次用不同的实例数据"。

实例数据是什么？每根 K 线只需要五个数：bar index `i`、开盘 `o`、最高 `h`、最低 `l`、收盘 `c`，外加一个颜色(涨跌)。这些以紧凑的 typed array 上传到一个 instance buffer。vertex shader 在 GPU 上为每个实例计算屏幕位置：

```wgsl
// 简化的 WGSL vertex shader 思路(注释解释每步在做什么)
struct Uniforms {
  firstVisibleIndex: f32,  // 视口最左 bar 序号
  barWidth: f32,           // 每根 K 线像素宽
  priceMin: f32,           // 可见价格下界
  priceMax: f32,           // 可见价格上界
  viewport: vec2f,         // 画布宽高
  logScale: f32,           // 0=线性 1=对数
};

// 把价格映射到屏幕 Y(对应 §1.2 的公式)
fn priceToY(p: f32, u: Uniforms) -> f32 {
  var lo = u.priceMin; var hi = u.priceMax; var pp = p;
  if (u.logScale > 0.5) { lo = log(lo); hi = log(hi); pp = log(p); }
  let t = (pp - lo) / (hi - lo);
  return u.viewport.y - t * u.viewport.y;  // 翻转 Y
}

// 每个实例(每根 K 线)的处理:
//   instance 提供 (i, o, h, l, c),vertex 提供单位矩形的角点
//   shader 把单位矩形拉伸到 [open, close] 的价格区间、放到第 i 列
@vertex
fn vs(@location(0) corner: vec2f,            // 单位矩形角点 (0..1, 0..1)
      @location(1) bar: vec4f,               // (i, open, close, 用不到)
      @location(2) extras: vec2f) -> ... {
  let i = bar.x;
  let xCenter = (i - u.firstVisibleIndex) * u.barWidth + u.barWidth * 0.5;
  let bodyLeft = xCenter - u.barWidth * 0.4;  // 实体占 80% 宽,留间隙
  let yOpen = priceToY(bar.y, u);
  let yClose = priceToY(bar.z, u);
  // corner.x 在 [0,1] 之间插值出左右边,corner.y 插值出上下边
  let x = bodyLeft + corner.x * (u.barWidth * 0.8);
  let y = mix(yOpen, yClose, corner.y);
  // ... 转成 clip space 返回
}
```

这段的关键启发是：**所有坐标变换在 GPU 上做，CPU 只负责把原始 OHLC 数据上传一次**。缩放、平移时，CPU 不重新计算任何 K 线位置，只是改几个 uniform 值(`firstVisibleIndex`、`barWidth`、`priceMin/Max`)，GPU 重新算所有位置。这就是为什么 GPU 渲染缩放能丝滑——CPU 几乎没有工作。

影线用类似的实例化处理，或者作为细矩形和实体一起画。

### 2.4 百万 K 线的真相：LOD 与 M4 降采样

这里有一个新手容易误解的点，必须澄清，否则会过度设计。"渲染一百万根 K 线"这个说法本身是有歧义的。屏幕宽度通常就一两千像素，你不可能在一千个像素里画清楚一百万根 K 线——画上去也是一团糊。所以"支持一百万根"真正的含义是：**数据里有一百万根，但任何时刻只渲染视口内可见的那些，且当可见根数超过像素数时做降采样**。

这就引出 **LOD(level of detail)** 和降采样。当用户缩放到"一根 K 线还不到一个像素宽"时(比如视口要显示十万根但只有两千像素)，直接画十万个实例既浪费又糊。正确做法是把多根 K 线聚合成"一个像素列一根"。聚合不能简单取平均，那会丢掉极值，视觉上会变形。金融时间序列降采样的标准算法叫 **M4**：对每个像素列覆盖的那批 K 线，保留四个点——这批里的**最高价(Max)、最低价(Min)、第一根的开盘(first)、最后一根的收盘(last)**。M4 的数学保证是：它能精确保留降采样后折线/K 线图的视觉轮廓(像素级一致)，因为一个像素列的视觉表现完全由这四个极值决定。

所以 P1 的渲染管线实际是：`data` 层持有全量(可能百万根)Arrow 列存 → `scale` 算出当前可见区间和"每像素几根" → 若每像素多于一根，`compute` 用 M4 降采样到可见像素数 → renderer 实例化绘制降采样后的结果。降采样可以在 CPU 做(几千个像素列，量不大)，也可以在 GPU compute 里做。

**trade-off**：M4 完美保留视觉轮廓，但它丢失了"这个像素列里 K 线的实体颜色分布"这类细节；对于 K 线图这无所谓，对于需要每根都精确的场景(放大状态)则不用降采样直接画。这是一个根据缩放级别自动切换的策略，不是非此即彼。

### 2.5 fp64 jitter 问题与 origin-shift 解法(关键 trade-off)

这是一个真实的、会咬人的精度问题，而且业界有两种解法，选错会白费力气，所以单独讲。

问题是这样的：GPU 默认用 32 位单精度浮点(fp32)，它的尾数只有 23 位，大约对应 7 位十进制有效数字。这对很多场景够用，但金融价格会爆掉它。设想比特币价格 67000.12，tick 是 0.01，你需要区分 67000.12 和 67000.13，这需要 7 位有效数字——正好在 fp32 的精度边缘。更糟的是当用户**放大**到很窄的价格区间(比如只看 67000.10 到 67000.20 这 0.1 美元的范围)，fp32 在做 `(p - pMin) / (pMax - pMin)` 这个减法时，两个很接近的大数相减会发生"灾难性抵消"，结果的有效位数骤降，K 线就会在屏幕上抖动、对不齐。这就是 jitter。

业界有两种解法。

第一种是 deck.gl 用的 **fp64 emulation(双精度模拟)**：用两个 fp32 拼出一个伪双精度——`hi = fround(x)` 取最接近的 fp32，`lo = x - hi` 存残差，然后所有加减乘都用带误差补偿的算法(two-sum、two-product)在 shader 里手算。这能在 GPU 上获得接近 fp64 的精度，但代价是每个数变成两个浮点、每个运算变成好几条指令，ALU 开销大约翻两到四倍，shader 也复杂得多。deck.gl 需要它，因为它做的是全球地理可视化，经纬度的绝对值大、跨度也大，逃不掉。

第二种是 **origin-shift(原点平移)**：既然问题出在"大数相减"，那就在 CPU 上(CPU 是 fp64，精度足够)先减掉一个参考值，让 GPU 只处理小范围的相对值。具体做法是，每帧取当前可见价格区间的中点 `pRef = (pMin + pMax) / 2` 作为参考，在 CPU 上把要上传的价格全部减去 `pRef`，GPU 收到的是 `p - pRef` 这种绝对值很小的数(在放大场景下可能只有 0.0几)，fp32 处理这种小数毫无压力。uniform 里的 `priceMin/Max` 也相应改成相对值。GPU 算完得到的是相对屏幕位置，不需要再加回去因为屏幕位置本身就是相对的。

**这是 P1 里一个明确的 trade-off，而且我的建议很坚定**：金融图表用 origin-shift，不要用 fp64 emulation。理由是，金融图表任何时刻的**可见**价格范围都是有限的、相对集中的(你不会同时看 0.0001 美元的山寨币和 67000 美元的比特币在同一个 Y 轴上)，origin-shift 这个"减去参考值"的廉价技巧就能把所有精度问题消灭，而它几乎零成本——只是 CPU 上每帧做一次减法。fp64 emulation 是为"绝对值大且无法局部化"的场景(地理坐标)准备的重武器，在金融图表里是杀鸡用牛刀，白白损失两到四倍的 GPU 算力。这个判断能帮你和作者省下可能好几周的弯路。

### 2.6 流式 tick 的环形 buffer

实时场景下 tick 以每秒成百上千的速度涌入，如果每来一个 tick 就重新分配整个 GPU buffer 并重传，会卡死。正确做法是预分配一个固定大小 N 的 **环形 buffer(ring buffer)**，维护一个写指针，新 tick 写到写指针处然后指针前进、到末尾绕回开头。渲染时根据写指针和 N 算出"最近 N 个 tick"的区间。WebGPU 的 `queue.writeBuffer` 支持写 buffer 的子区域，所以每次只传新来的那一小段，不动其余部分。这是 WebGPU storage buffer 灵活读写能力的直接受益场景，WebGL 在这里会非常别扭。

---

## 3. P1 的三个差异化组件：数据模型与数学

渲染后端搞定后，真正拉开和 TradingView 差距的是三个它没有的组件。这三个组件的难点都不在渲染(渲染交给 §2 的 GPU 能力)，而在**数据模型与聚合数学**——这正是你负责的部分。逐个讲透。

### 3.1 Volume Profile：POC / VAH / VAL 的算法

Volume Profile(成交量分布图)回答一个问题：在某段时间里，各个**价格水平**上分别成交了多少量？它把成交量按价格(而非时间)聚合，画成横向的直方图贴在价格轴上。交易员用它找"成交密集区"，因为这些价位往往是支撑或阻力。

数据模型上，先把可见价格范围切成 N 个等高的价格桶(price bin)，桶高通常等于若干个 tick。然后遍历每根 K 线(或每笔成交)，把它的成交量累加到对应的价格桶。这里有个细节：一根 K 线横跨 high 到 low 一个区间，它的成交量该算到哪个桶？最简单的做法是全部算到典型价 `(high+low+close)/3` 所在的桶；更精确的做法是把这根 K 线的成交量按它覆盖的价格区间均摊到多个桶里。前者快、够用，后者精确、稍慢，这是一个 **trade-off**，建议默认用典型价、提供精确模式作为选项。

聚合出每个桶的总量后，算三个关键值。**POC(Point of Control，控制点)** 是成交量最大的那个桶的价格，一行 argmax 搞定。**Value Area(价值区域)** 是包含总成交量 70%(这是芝商所的传统约定，可配置)的、围绕 POC 的连续价格区间，它的上下边界就是 **VAH(Value Area High)** 和 **VAL(Value Area Low)**。

Value Area 的算法是一个贪心扩张，值得写清楚因为容易写错：

```
# 求 Value Area 的标准贪心算法(注释解释每步意图)
1. 找到 POC 桶,把它放进 value area,累计量 = POC 的量
2. target = 总量 * 0.70
3. 当 累计量 < target:
     看 value area 当前上边界的上一个桶(upper)和下边界的下一个桶(lower)
     比较 upper 和 lower 两个桶的成交量
     把成交量更大的那一侧并进 value area,累计量加上它
     (若一侧已到边界,只能并另一侧)
4. 此时 value area 的最高价 = VAH,最低价 = VAL
```

这个"向成交量更大的一侧扩张"的贪心策略是行业标准，它的直觉是：价值区域应该顺着成交密集的方向生长。

GPU 加速点：把成交量累加到价格桶，本质是一个 histogram/scatter-add 操作，正是 §2.1 说的 compute shader 的主场。当成交记录是百万级时，GPU 分桶相比 CPU 有数量级加速。但 POC、VAH、VAL 这几步是在 N 个桶(通常几百个)上的串行逻辑，量很小，在 CPU 上做就行，不值得上 GPU。这是一个清晰的"重活上 GPU、轻活留 CPU"的分工。

### 3.2 Order Book Heatmap：L2 流式聚合

这是最有"Bookmap 既视感"、也是最能体现技术深度的组件。它把订单簿的挂单量随时间变化画成热力图——X 轴是时间，Y 轴是价格，每个格子的颜色深浅代表那个时刻、那个价位上挂着多少待成交的量(resting liquidity)。交易员用它看"大单墙"的出现和撤离。

数据模型的难点在于：订单簿数据是**增量(delta)**形式来的。交易所推送的不是"当前完整订单簿"，而是"在价格 P 上，挂单量变成了 S"这样的更新流(S 为 0 表示该价位挂单撤空)。你需要在客户端**维护一个完整的订单簿状态**——一个价格到挂单量的有序映射(买盘一个、卖盘一个)，每来一个 delta 就更新对应价位。这个维护是纯 CPU 的流式逻辑，用一个排序结构(可以是按 tick 量化后的价格为 key 的 Map，配合有序的价格数组)。

维护好实时订单簿后，要把它"录"成热力图。做法是按固定时间间隔(比如每 100 毫秒，对应热力图的一个像素列)对当前订单簿拍一个**快照(snapshot)**，把每个价位的挂单量写进"时间 × 价格"的二维网格的对应一列。随时间推移，网格从左滚到右，形成热力图。

这里有一个重要的 **trade-off 是 snapshot 还是 delta 存储**。每个时间列都存完整快照，内存消耗是 `时间列数 × 价格档数`，如果要保留很长历史会很大。另一种是只存 delta、需要时回放重建，省内存但查询慢。建议：近期窗口(屏幕上能看到的，比如最近几分钟)用快照存在 GPU storage buffer 里直接渲染，更早的历史降采样后存或丢弃。金融实时热力图的价值主要在近期，这个取舍是合理的。

颜色映射要用**对数色阶**，这是另一个关键点。挂单量的分布极度不均——大部分价位挂几手，少数价位挂几千手。如果用线性色阶，那几个大单会让其余全部变成同一种淡色，看不出结构。对数映射 `intensity = (ln(size) - ln(sizeMin)) / (ln(sizeMax) - ln(sizeMin))` 把这种跨数量级的分布拉开，这就是 §2.2 要引入 `d3-scale-chromatic` 的原因——用 viridis 这种感知均匀色阶配合对数标度，大单墙和散单的层次才能同时看清。

渲染上，二维网格天然就是一张纹理或一个 storage buffer，GPU 画热力图是它最擅长的事，每个格子一个 fragment，几乎零成本。

### 3.3 Footprint Chart：逐笔的买卖分类与失衡

Footprint(成交簇图)是专业 order flow 交易员的核心工具，零售图表几乎都没有。它在每根 K 线**内部**展开，显示这根 K 线的每个价格档上，主动买入和主动卖出各成交了多少量。它回答的是"这根 K 线涨上去，是真有买盘推动，还是只是没人卖？"

数据模型的核心难点是 **trade 的买卖方向分类(aggressor side)**。每一笔成交，要判断它是"主动买"(吃掉了卖方挂单，aggressor 是买方)还是"主动卖"(砸了买方挂单)。很多交易所的逐笔数据直接带 aggressor 标志(比如 Binance 的 trade 流有 `isBuyerMaker` 字段)，那直接用。如果数据不带方向，就要用 **tick rule** 或 **Lee-Ready 算法** 推断：tick rule 是"成交价比上一笔高 → 判为主动买，低 → 主动卖，相等 → 沿用上一笔方向"；Lee-Ready 更精确，它先看成交价相对买卖中价的位置，落在中价之上判买、之下判卖，正好在中价才退回用 tick rule。这是一个 **trade-off**：有 aggressor 标志时零误差，没有时 tick rule 简单但在快速行情下有误判，Lee-Ready 准一些但要维护买卖中价。建议优先用交易所给的标志，缺失时用 tick rule 兜底并标注"推断值"。

分类好之后，数据模型是：对每根 K 线(时间桶)× 每个价格档，维护两个累加器——主动买量 `askVol`(吃 ask 的量)和主动卖量 `bidVol`(吃 bid 的量)。基于这两个数算两个交易员关心的指标。**逐档失衡(imbalance)** 衡量某个价位买卖力量谁占优，常用对角线失衡：把某价位的主动买量和**下一档**的主动卖量相比，因为主动买吃的是上方的 ask、主动卖砸的是下方的 bid，对角比较才对齐。一个常见判据是某方向是另一方向的 3 倍以上就标记为失衡。**Delta** 是一根 K 线的主动买量减主动卖量的净值 `delta = ΣaskVol - ΣbidVol`，正值说明买方主导；把每根的 delta 累加得到 **cumulative delta**，这条曲线和价格的背离是 order flow 交易的经典信号。

渲染上，footprint 在每根 K 线内要画很多个小数字格子(每价格档一行，左右分别是买卖量)，密度很高，这正是需要 GPU 实例化文本/矩形的场景，也是 WebGL 在高密度下吃力、WebGPU 更从容的地方。

### 3.4 顺带说一句 Depth Chart

深度图相对简单，作为入场券组件提一下数学。它把订单簿的累积挂单量画成两条阶梯面积：从中价向上，卖盘按价格升序累积 `askDepth(p) = Σ size(p') for all ask p' ≤ p`；向下，买盘按价格降序累积。两条曲线向两侧延展，中间的"谷"就是买卖价差。它用的是 §3.2 维护的同一个订单簿状态，只是换一种聚合(累积和)和呈现(阶梯面积)，数据模型可以复用。

---

## 4. P2 — 可插拔指标 Runtime(打 Pine 的封闭)

P1 把渲染和差异化组件做到超越 TradingView，P2 攻它的另一条护城河：指标系统的封闭性。

### 4.1 架构：指标只产出数据，不碰渲染

整个指标系统的架构基石是一句话：**指标是纯函数，输入是 bar 序列和参数，输出是 plot 数据(线、柱、标记)，它绝不直接画任何东西**。渲染由 core 的 renderer 统一负责。这个解耦带来两个好处：一是同一个指标在 WebGL 和 WebGPU 后端下都能跑(因为它根本不知道后端存在)，二是指标可以在 Web Worker 或 WASM 沙箱里算，不阻塞主线程。

指标接口设计成这样：

```typescript
// 指标的统一契约:三个生命周期方法
interface Indicator<P = unknown, S = unknown> {
  // 用参数初始化,返回指标的内部状态(比如均线要记住窗口)
  init(params: P): S;
  // 每来一根新 bar,更新状态并返回这根 bar 上要画的点
  onBar(state: S, bar: Bar, index: number): Plot[];
  // (可选)逐笔模式,用于 order flow 类指标
  onTick?(state: S, tick: Tick): Plot[];
}

interface Plot {
  pane: 'main' | 'sub';       // 画在主图还是副图
  type: 'line' | 'histogram' | 'marker' | 'band';
  value: number | [number, number];  // band 是上下两值
  style: PlotStyle;
}
```

KLineQuant 现有的内置指标(MA/BOLL/RSI/MACD 等)迁移到这个接口下，作为第一批内置实现，验证接口设计够不够用。

### 4.2 两条扩展路径与它们的 trade-off

让指标"可插拔"有两条路，各有取舍，建议两条都提供，因为它们服务不同人群。

第一条是 **TS/JS 指标**。开发者直接写一个实现上面接口的 TypeScript 对象，注册进 core 就能用。这是最低门槛，前端开发者立刻能上手，适合做产品内的自定义指标。它的代价是没有沙箱——指标代码和你的应用跑在同一个上下文，一个写得烂的指标能拖垮整个页面，而且不能安全地加载陌生人写的指标。所以 TS 指标适合"自己人写的指标"，不适合开放市场。

第二条是 **WASM 指标**，这才是打 Pine 的真正武器。指标用 Rust 或 AssemblyScript 写，编译成 WASM 模块，在沙箱里执行。它的三个 Pine 给不了的优势：一是**可移植**，WASM 模块是个文件，能下载、能在任何实现了同一 ABI 的平台跑，不像 Pine 锁死在 TradingView 服务器；二是**安全**，WASM 沙箱天然隔离，加上能力限制(指标只能读它声明的数据，不能联网、不能碰 DOM、不能持久化)，可以安全加载第三方指标；三是**可签名可复现**，模块有 hash，机构合规要的"这个指标到底算了什么、版本是什么"可以被审计。

轮子选型上，WASM 指标有一个真实的 **trade-off**。理想的未来形态是 **WASM Component Model**(配合 `@bytecodealliance/jco` 在浏览器跑、用 WIT 描述接口)，它面向未来、跨语言、接口规范。但 Component Model 还在成熟中，工具链复杂，2026 年这个时间点对一个要稳定的库偏激进。务实的做法是 v0 之后先用**简单的手写 ABI**——约定好 WASM 模块导出 `init`/`on_bar` 函数、通过线性内存里的约定布局传 bar 数据和 plot 数据，host 用普通的 `WebAssembly.instantiate` 加载。这套简单 ABI 现在就能稳定跑，等 Component Model 工具链成熟了，可以横向加一个 Component Model 的 host 作为第二种加载方式，旧的简单 ABI 不动。这又是一次"先简单、留接口、将来横向加"的体现。

编译工具链：Rust 指标用 `cargo` + `wasm-bindgen`(或更轻的 `wasm-pack`)，AssemblyScript 用 `asc` 编译器。给开发者提供一个指标项目模板，封装掉编译配置。

### 4.3 GPU 指标

可向量化的指标——移动平均、EMA、ATR、布林带、VWAP——本质是对价格序列做滑动窗口运算，这种规则的并行计算适合放进 §2 的 compute shader，直接在 GPU 上算，而且能和渲染共享同一个数据 buffer，省掉 CPU-GPU 往返。这条路径作为性能优化，对那些"指标要实时跟着百万级数据刷新"的场景有意义。它由作者(渲染/性能主场)实现，接口上对开发者透明——开发者写的指标声明自己"可向量化"，core 自动选 GPU 路径。

---

## 5. P3 — 数据层工业化(Arrow + DuckDB-WASM)

P1/P2 假设数据已经在内存里，P3 把数据的获取、存储、查询做成工业级，这是支撑前面所有高密度和未来 AI 能力的地基。

### 5.1 内存格式统一为 Apache Arrow

这是 P3 的核心决策。让所有进入 core 的数据统一成 **Apache Arrow** 的列式格式(轮子是官方的 `apache-arrow` JS 库)。为什么是列式而不是大家习惯的"对象数组"(`[{time, open, high...}, ...]`)？因为对象数组在 JS 里每个对象是一个堆分配，百万根就是百万个堆对象，内存碎片化、GC 压力大、而且要喂给 GPU 时还得逐个拆出来拼成 typed array。Arrow 的列式布局是：所有 time 连续存一个 Float64Array、所有 open 连续存一个、等等。这带来三个直接收益：内存紧凑无对象开销；喂给 GPU 时可以**零拷贝**，因为 Arrow 的列本身就是 typed array，可以直接映射成 GPU buffer(呼应 §2.1)；供给 DuckDB 查询时也是零拷贝。

这个迁移对上层是透明的——三框架壳和组件 API 接受的还是开发者友好的格式，core 在入口处转成 Arrow。

### 5.2 DuckDB-WASM 做浏览器内查询

引入 **`@duckdb/duckdb-wasm`**，让开发者能直接对历史数据写 SQL。这是 TradingView 结构上没有的能力——它的数据是黑盒，你不能问它"找出所有成交量超过均量三倍的 K 线"。DuckDB-WASM 是把整个 DuckDB(一个高性能列式分析数据库)编译成 WASM 跑在浏览器里，能在浏览器内查询百万级行的 Parquet 文件，而且因为它和 Arrow 同宗，数据在 DuckDB 和 core 之间零拷贝流转。

应用场景：用户加载一个币种几年的数据(Parquet 格式，从你的网关或用户自己的存储拉)，DuckDB-WASM 在浏览器里直接 SQL 过滤、聚合，结果以 Arrow 形式喂给图表渲染。这把"数据探索"变成图表库的一等能力。

**trade-off**：DuckDB-WASM 的体积不小(WASM 包加上要加载的数据)，首次加载有成本，所以它应该是**按需懒加载**——只有当用户用到 SQL 查询功能时才加载，普通看图不引入。

### 5.3 数据接入抽象与 UDF 兼容层

定义统一的 `DataSource` 接口，方法形态刻意 **mirror TradingView 的 UDF/Datafeed 协议**(`resolveSymbol`、`getBars`、`subscribeBars`)。这么做有一个战略目的：同时提供一个 `UDFDataSource` 适配器，能直接消费现存的 TradingView UDF 后端。市面上大量交易所、券商已经为接入 TradingView 实现了 UDF 后端，这个兼容层让他们**零成本**把数据接到 @klinechart-quant，这是抢 TradingView 现有集成方的迁移路径，类似 PostgreSQL 兼容 MySQL 协议的意义。

默认内置实现：Binance、Coinbase、Bybit、Deribit 的 WebSocket adapter(crypto 数据免费、无牌照)。本地缓存用浏览器的 **OPFS(Origin Private File System)** 存 Parquet、**IndexedDB** 存元数据，replay 时不重复拉取。

### 5.4 不可回避的硬边界

必须写进文档、写进 README、写进每一次对外沟通：**实时美股、期货数据在结构上不可能免费**。交易所牌照是物理约束——纽交所的数字媒体类许可在每月数万美元量级，纳斯达克 TotalView 起步每专业用户约两千美元每月，芝商所是分级的 distribution license。这不是软件能解决的问题，是法律和商业问题。所以这个组件库/数据层在可预见阶段只覆盖三类数据：crypto(交易所 WebSocket 真免费)、链上数据(Pyth、Bitquery 等开放)、延迟数据(T+15 分钟以后通常无牌照要求，但要遵守各源的服务条款)。实时美股由用户自带牌照接入，组件库本身**永远不打包任何数据 credential**。这条边界讲得越早越清楚，企业销售环节越不会爆雷。

---

## 6. P4 — AI 接入(组件可被 LLM 操控)

P4 是你最早那个"我在 web 里但仍能操控 UI"洞察落到组件库层面的**最小、克制**的形态。这里要特别克制：P4 不做完整的 conversational runtime、不做 agent、不做 event-sourcing，那些是 P5 之后看市场反应才碰的东西。P4 只做三件让组件"AI-ready"的事。

第一，**给每个组件一套干净的命令式 API**。`chart.addIndicator(name, params)`、`chart.setTimeframe(tf)`、`chart.zoomToRange(from, to)`、`chart.annotate(spec)`。这些 API 本来做命令式控制就该有，顺手把它们的 schema 包装成 LLM 能调用的 **function-calling / MCP tool** 描述即可。LLM 不需要理解你的内部状态，它只是调这些 API。

第二，**让组件状态可序列化**。整个图表的状态(当前指标、时间范围、绘图、布局)能 `serialize()` 成 JSON、能 `deserialize()` 恢复。这让 LLM 既能"读懂当前图表是什么样"，也能"生成一份新的图表配置"。一个直接的应用：用户说"给我一个看资金流的布局"，LLM 生成一份 state JSON，组件加载它。这其实就是 generative UI 在组件层面的雏形——LLM 不写渲染代码，只生成对**已有能力**的配置，core 校验后渲染。这个边界(LLM 只编排已有能力、绝不生成裸代码)是安全和可控的关键。

第三，**给组件一个 `describe()` 方法**，返回当前图表的结构化自然语言描述，让 LLM 能回答"现在图上有什么""这个指标在说什么"。配合让 LLM 解读形态，这是 Pine 因封闭做不到的能力。

模型不绑定，Claude/GPT/Gemini/本地都能接，适配器隔离 vendor 差异。

**trade-off 与克制的理由**：P4 完全可以做得更激进(完整 event log、agent 自主操作、多步规划)，但那会让组件库变成一个重型平台，偏离"先把组件做到超越 TradingView"的聚焦。P4 的命令式 API + 状态序列化 + describe 是组件库的**合理延伸**，加完它还是一个组件库，只是这个组件库恰好 AI 能用。真正的 runtime 跃迁留给 P5，而且只在市场拉动时才做。

---

## 7. P5 与之后(条件触发，不默认执行)

P5 是从组件库长成产品(工作台、协作、runtime)，但它**不是默认路线**，是一个由市场信号触发的可选分支。判据很简单：到 P1–P4 走完(约 14 个月)时，如果有可观的开发者采用(GitHub 星标、生产环境使用、付费意向)，才往产品走，那时是市场拉着你做；如果反应平淡，就**停在组件库**——一个被广泛采用的开源金融组件库本身就是一个健康、有价值、可被收购的成果，不必硬往平台推。这个"愿意停下"的纪律，和前面每个阶段都设回退条件是同一个工程价值观：每一步都要可验证、可止损，不为宏大叙事透支。

---

## 8. 全程的工程纪律与分工

把贯穿所有阶段的三条铁律收在这里。第一，**横向加而非推翻**：WebGPU、WASM 指标、Arrow、AI 每一个都是新增的可选层，旧的 WebGL renderer、内置 TS 指标、JSON 数据接入永远作为 fallback 保留，不删。第二，**core 框架无关、壳极薄**：任何新能力先进 core，三个框架壳只做挂载和 props 传递，永不在某个壳里写业务逻辑，否则全生态承诺立刻破产。第三，**license 干净**：core 用 Apache 2.0，避开 AGPL/GPL，未来的商业能力放独立包，不污染核心。

分工沿用已定的格局，作者是渲染与性能的主场，你是产品、API 与数据模型的主场，契约点永远是 core 的 renderer 接口和 store 接口——接口定好，各干各的，不在同一文件打架：

P1 阶段，作者做 WebGPU renderer、compute shader、环形 buffer、origin-shift；你做三个差异化组件的数据模型(volume profile 的 POC/VAH/VAL、order book 的流式维护与快照、footprint 的买卖分类与失衡)和它们的视觉规格。P2 阶段，作者做指标执行框架和 GPU 指标路径；你做指标接口设计、WASM ABI 约定、指标市场形态。P3 阶段，作者做 Arrow 零拷贝管线和 DuckDB 集成；你做 DataSource 协议、UDF 兼容层、缓存策略。P4 阶段，作者保证命令式 API 的性能和状态序列化的完整；你做 tool schema、LLM 接入体验、describe 的语义设计。

---

## 9. 一页速查：每个决策点的 trade-off 结论

为方便你和作者快速对齐，把全文的关键取舍结论汇总。X 轴用 bar-index 而非时间戳，换取 K 线等宽的手感，代价是跨周期时间对齐需额外的映射层。精度问题用 origin-shift 而非 fp64 emulation，因为金融可见价格范围有限，廉价的减参考值技巧就够，省下两到四倍 GPU 算力。底层渲染用原生 WebGPU + webgpu-utils 而非 three.js，换取完全控制力和最小包体积，代价是团队要真懂 GPU 管线。百万 K 线用 M4 降采样而非全量绘制，精确保留视觉轮廓，放大到每根可见时自动切回全量。WebGPU 永远配 WebGL fallback，牺牲一点维护成本换浏览器覆盖率和稳健性。WASM 指标先用简单手写 ABI 而非 Component Model，现在就能稳定跑，将来横向加 Component Model host。order book heatmap 近期窗口用快照存 GPU、远期降采样，在内存和查询速度间取平衡。DuckDB-WASM 按需懒加载，普通看图不付出它的体积成本。指标既给 TS 路径(低门槛、无沙箱、自己人用)又给 WASM 路径(可移植、安全、可开放市场)，分别服务不同人群。AI 接入在 P4 保持克制，只做命令式 API、状态序列化、describe，完整 runtime 留给市场拉动的 P5。

---

*本文档是 v0 之后的工程蓝图，P1 是紧接的下一步，也是最硬的一块。建议以 P1 的 WebGPU renderer 接口设计与三个差异化组件的数据模型作为第一个迭代周期的目标。*
