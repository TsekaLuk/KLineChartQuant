# @klinechart-quant/react

> Idiomatic React 18/19 bindings for [`@klinechart-quant/core`](../core/). Hook-based, SSR-safe, tearing-safe via `useSyncExternalStore`.

```bash
pnpm add @klinechart-quant/react @klinechart-quant/core react
```

## Quick start

```tsx
'use client'  // Next.js App Router only

import { useRef } from 'react'
import { KLineChart } from '@klinechart-quant/react'
import type { KLineData } from '@klinechart-quant/core'

const data: KLineData[] = [/* your bars */]

export default function Page() {
    return (
        <KLineChart
            data={data}
            initialZoomLevel={5}
            theme="dark"
            className="h-[400px] w-full"
        />
    )
}
```

## Hooks

### `useChart(ref, opts)`

The base hook. Mounts a chart in the ref'd element after commit; returns the controller (or `null` until ref is populated).

```tsx
const ref = useRef<HTMLDivElement>(null)
const controller = useChart(ref, { data, theme: 'dark' })

return <div ref={ref} className="h-[400px]" />
```

### `useIndicatorSelector(controller)`

Subscribes to the indicator catalog + active list with proper concurrent-React tearing safety. Returns the current snapshots + mutation methods.

```tsx
const { catalog, active, add, remove } = useIndicatorSelector(controller)

return (
    <div>
        {active.map((ind) => (
            <button key={ind.id} onClick={() => remove(ind.id)}>
                {ind.label} ×
            </button>
        ))}
    </div>
)
```

## SSR safety contract

- **Module import is safe on the server.** No `window`/`document` access at top level.
- **`useChart` returns `null` on the server** — the actual mount runs in `useEffect`.
- **Next.js 15 App Router**: only the component that mounts the chart needs `'use client'`. The adapter module itself is safe to import from server components.

## Component vs imperative

The `<KLineChart>` component wraps `useChart` internally for the common case. When you need the controller (to imperatively call `setData`, `zoomToLevel`, `addIndicator`, …), use `useChart` with a ref directly.

## Tearing safety

All hooks use `useSyncExternalStore` with stable `subscribe` (via `useMemo`) and cached snapshots. Safe in concurrent React 18+/19. No flicker on time-slicing.

## Server components

The adapter is **client-component-bound**. Import it from a `'use client'` boundary. The chart engine is interactive (DOM mutations + canvas) and cannot meaningfully render on the server; importing the adapter module in a server file is safe but invoking the hooks is not.

## Peer dependencies

| Package | Range |
| --- | --- |
| `@klinechart-quant/core` | `workspace:*` (matches your installed version) |
| `react` | `^18 || ^19` |

## License

MIT
