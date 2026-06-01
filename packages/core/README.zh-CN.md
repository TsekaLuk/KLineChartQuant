# @363045841yyt/klinechart-core

无头、响应式 K 线（蜡烛图）图表引擎，零框架依赖�?

## 概览

`@363045841yyt/klinechart-core` �?`@363045841yyt/klinechart` 生态的底层图表引擎。它处理数据管理、渲染协调、视口计算和插件编排 —�?完全不依赖任�?UI 框架�?

## 安装

```bash
npm install @363045841yyt/klinechart-core
# �?
pnpm add @363045841yyt/klinechart-core
# �?
yarn add @363045841yyt/klinechart-core
```

## 快速开�?

```typescript
import { createChartController } from '@363045841yyt/klinechart-core/controllers'
import type { KLineData } from '@363045841yyt/klinechart-core'

const controller = createChartController({
  container: document.getElementById('chart'),
  data: [],
  initialZoomLevel: 3,
  theme: 'light'
})

// 加载数据
const data: KLineData[] = [
  { timestamp: 1704067200000, open: 100, high: 105, low: 98, close: 103, volume: 10000 },
  // ...
]
controller.setData(data)

// 清理
controller.dispose()
```

## 导出�?

### 控制�?
- `createChartController` �?图表实例工厂
- `ChartController` �?主控制器接口

### 响应�?
- `Signal<T>` �?响应式状态原�?
- `effect`, `peek` �?响应式工�?

### 引擎
- `Chart` �?底层图表实例（通过 `@363045841yyt/klinechart-core/engine/chart`�?
- `ChartStore` �?数据管理
- 渲染器（通过子路径导入）

### 插件系统
- `PluginHost` �?插件注册和生命周�?
- `EventBus` �?跨组件通信
- `StateStore` �?全局状态管�?

### 类型
- `KLineData` �?K 线数据点
- `ChartViewport` �?视口状�?
- `InteractionSnapshot` �?交互状�?

### 子路径导�?

本包支持细粒度的子路径导入，便于 tree-shaking�?

```typescript
// 核心引擎
import { Chart } from '@363045841yyt/klinechart-core/engine/chart'
import { ChartStore } from '@363045841yyt/klinechart-core/engine/chart-store'

// 工具
import { zoom } from '@363045841yyt/klinechart-core/engine/utils/zoom'

// 配置
import { DEFAULT_SETTINGS } from '@363045841yyt/klinechart-core/config'

// 插件
import { EventBus } from '@363045841yyt/klinechart-core/plugin'

// 版本
import { VERSION } from '@363045841yyt/klinechart-core/version'
```

## 架构

```
┌─────────────────────────────────────�?
�?          控制器层                   �? �?高级 API
├─────────────────────────────────────�?
�?         插件系统�?                 �? �?EventBus, StateStore
├─────────────────────────────────────�?
�?          引擎�?                    �? �?Chart, ChartStore
├─────────────────────────────────────�?
�?         渲染器层                    �? �?Canvas/WebGL 渲染�?
├─────────────────────────────────────�?
�?         响应式层                    �? �?Signal 状态管�?
└─────────────────────────────────────�?
```

## ChartController API

### 创建控制�?

```typescript
import { createChartController } from '@363045841yyt/klinechart-core/controllers'

const controller = createChartController({
  container: HTMLElement,
  data: KLineData[],
  initialZoomLevel?: number,
  zoomLevels?: number,
  theme?: 'light' | 'dark',
  yPaddingPx?: number,
  minKWidth?: number,
  maxKWidth?: number
})
```

### 方法

- `setData(data: KLineData[]): void` �?更新图表数据
- `setTheme(theme: 'light' | 'dark'): void` �?切换主题
- `zoomToLevel(level: number, anchorX?: number): void` �?缩放到指定级�?
- `zoomIn(anchorX?: number): void` �?放大
- `zoomOut(anchorX?: number): void` �?缩小
- `addIndicator(definitionId: string, role: 'main' | 'sub', params?): string` �?添加指标
- `removeIndicator(instanceId: string): boolean` �?移除指标
- `dispose(): void` �?清理销�?

### 响应式状�?

通过 Signal 访问响应式状态：

```typescript
// 当前视口
controller.viewport.subscribe((vp) => {
  console.log('缩放级别:', vp.zoomLevel)
})

// 活跃指标
controller.indicators.subscribe((inds) => {
  console.log('活跃指标:', inds)
})

// 交互状�?
controller.interactionState.subscribe((state) => {
  console.log('悬停:', state.hover)
})
```

## 语义化配�?

对于 AI/LLM 驱动的图表配置，使用语义控制器：

```typescript
import { SemanticChartController } from '@363045841yyt/klinechart-core/semantic'

const semantic = new SemanticChartController(chartInstance)

// 应用自然语言配置
semantic.applyConfig({
  "stockSymbol": "AAPL",
  "dateRange": { "start": "2024-01-01", "end": "2024-06-01" },
  "indicators": ["MA20", "MACD", "RSI"],
  "chart": {
    "chartType": "candlestick",
    "theme": "dark",
    "gridLines": { "horizontal": true, "vertical": false }
  },
  "display": {
    "paneRatios": { "main": 0.6, "sub1": 0.4 }
  }
})
```

## 浏览器支�?

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

需要支持：
- ResizeObserver
- Canvas 2D Context
- ES2022（或转译�?

## 许可�?

MIT © 363045841

## 相关�?

- `@363045841yyt/klinechart` �?Vue 3 绑定
- `@363045841yyt/klinechart-react` �?React 绑定（即将推出）
- `@363045841yyt/klinechart-angular` �?Angular 绑定（即将推出）
