# @klinechart-quant/angular

> Idiomatic Angular 17+ bindings for [`@klinechart-quant/core`](../core/). Standalone components, `OnPush` change detection, `toSignal` bridge.

```bash
pnpm add @klinechart-quant/angular @klinechart-quant/core @angular/core @angular/common rxjs
```

## Quick start

```typescript
import { Component } from '@angular/core'
import { KLineChartComponent } from '@klinechart-quant/angular'
import type { KLineData } from '@klinechart-quant/core'

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [KLineChartComponent],
    template: `
        <kline-chart
            [data]="data"
            theme="dark"
            [initialZoomLevel]="5"
            style="display: block; height: 400px;"
        ></kline-chart>
    `,
})
export class AppComponent {
    data: ReadonlyArray<KLineData> = [/* your bars */]
}
```

## DI configuration

```typescript
import { bootstrapApplication } from '@angular/platform-browser'
import { provideKLineChart } from '@klinechart-quant/angular'
import { createChartController } from '@klinechart-quant/core'

bootstrapApplication(AppComponent, {
    providers: [
        provideKLineChart({
            theme: 'dark',                    // global default
            factory: createChartController,   // production factory
        }),
    ],
})
```

The `KLINE_CHART_FACTORY` injection token defaults to a no-op that throws on mount — in production you provide `createChartController` (or a mock in tests).

## Signal bridge

Core signals are bridged into Angular signals via the lightweight `coreSignalToAngular` helper, which respects the surrounding injection context's `DestroyRef`:

```typescript
import { Component, inject } from '@angular/core'
import { coreSignalToAngular } from '@klinechart-quant/angular'

@Component({ /* ... */ })
export class ChartViewerComponent {
    private chart = inject(SomeChartProvider)
    viewport = coreSignalToAngular(this.chart.viewport)  // Angular Signal<ChartViewport>
}
```

This is `OnPush`-friendly out of the box.

## SSR (Angular Universal)

The component guards DOM access with `isPlatformBrowser(inject(PLATFORM_ID))` in `ngAfterViewInit`, so server prerendering produces an empty container shell and the client hydrates with the live chart.

Works with `@angular/ssr` 17+. Tested with `provideExperimentalZonelessChangeDetection()` for the new zoneless mode.

## Peer dependencies

| Package | Range |
| --- | --- |
| `@klinechart-quant/core` | `workspace:*` |
| `@angular/core` / `@angular/common` | `^17 || ^18 || ^19` |
| `rxjs` | `^7` |

`zone.js` is required for non-zoneless apps; not declared as a peer because Angular projects already have it.

## License

MIT
