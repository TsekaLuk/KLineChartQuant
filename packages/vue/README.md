# @klinechart-quant/vue

> Idiomatic Vue 3 bindings for [`@klinechart-quant/core`](../core/). Composables + SFC component. Preserves the legacy `KMapPlugin.install` signature so existing `@363045841yyt/klinechart` users upgrade with zero code changes.

```bash
pnpm add @klinechart-quant/vue @klinechart-quant/core vue
```

## Quick start

```vue
<script setup lang="ts">
import { KLineChart } from '@klinechart-quant/vue'
import type { KLineData } from '@klinechart-quant/core'

const data: KLineData[] = [/* your bars */]
</script>

<template>
    <KLineChart :data="data" initial-zoom-level="5" theme="dark" />
</template>
```

## Composables

### `useChart(containerRef, opts)`

The base composable. Mounts on first render via template ref; returns `{ chart }` where `chart` is a `Ref<ChartController | null>`.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useChart } from '@klinechart-quant/vue'

const containerRef = ref<HTMLElement | null>(null)
const { chart } = useChart(containerRef, { data, theme: 'dark' })
</script>

<template>
    <div ref="containerRef" class="h-[400px] w-full" />
</template>
```

### `useIndicatorSelector(controller)`

Reactive bindings over the indicator catalog + active list via `shallowRef` + core `effect`. Returns refs + mutation methods.

```vue
<script setup lang="ts">
import { useIndicatorSelector } from '@klinechart-quant/vue'

const { catalog, active, add, remove } = useIndicatorSelector(controller)
</script>

<template>
    <button v-for="ind in active" :key="ind.id" @click="remove(ind.id)">
        {{ ind.label }} ×
    </button>
</template>
```

## Plugin API (legacy compat)

```typescript
import { createApp } from 'vue'
import { KMapPlugin } from '@klinechart-quant/vue'

const app = createApp(App)
app.use(KMapPlugin)  // registers <KLineChart> globally
```

This signature is preserved verbatim from the legacy `@363045841yyt/klinechart` package — existing users can upgrade without code changes.

## SSR / Nuxt 3

The adapter is SSR-safe by Vue 3's `onMounted` contract:

- Module import on the server is safe (no `window`/`document` at top level).
- `useChart` mounts only in `onMounted` (which Nuxt does not call on the server).
- Add to `nuxt.config.ts`:
  ```typescript
  build: { transpile: ['@klinechart-quant/vue', '@klinechart-quant/core'] }
  ```
  (Drop once we ship a built `dist/` to npm.)

## Why `shallowRef` (not `ref`) inside

We bridge core signals into Vue with `shallowRef`. Core signal values are immutable; deep proxying via `ref` is wasteful and silently breaks the `Object.is` short-circuits in the core notify loop. `shallowRef` keeps Vue out of the way.

## Peer dependencies

| Package | Range |
| --- | --- |
| `@klinechart-quant/core` | `workspace:*` |
| `vue` | `^3.4` |

## License

MIT
