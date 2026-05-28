/**
 * @klinechart-quant/angular — public API surface.
 *
 * Standalone Angular 17+/18+/19+ bindings for @klinechart-quant/core.
 * No NgModule. Bridges the core push-based signal layer into Angular's
 * own `signal()` so OnPush components refresh when controllers mutate state.
 */

import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    InjectionToken,
    Input,
    OnDestroy,
    PLATFORM_ID,
    Provider,
    Signal as NgSignal,
    ViewChild,
    inject,
    signal,
} from '@angular/core'
import { isPlatformBrowser } from '@angular/common'
import type {
    ChartController,
    ChartControllerFactory,
    ChartMountOptions,
    ChartViewport,
    KLineData,
    Signal as CoreSignal,
} from '@klinechart-quant/core'
import { createChartController } from '@klinechart-quant/core'

export type { ChartController, ChartMountOptions, ChartControllerFactory } from '@klinechart-quant/core'

// ---------------------------------------------------------------------------
// DI tokens
// ---------------------------------------------------------------------------

/** Globally-configured default theme. Component @Input wins per-instance. */
export const KLINE_CHART_THEME = new InjectionToken<'light' | 'dark'>(
    'KLINE_CHART_THEME',
    { providedIn: 'root', factory: () => 'light' as const },
)

/**
 * Factory used by `<kline-chart>` to produce a controller. Defaults to the
 * production `createChartController` from `@klinechart-quant/core`, so
 * consumers don't need to register it manually. Override per-application
 * via `provideKLineChart({ factory })` — useful for tests that inject a
 * mock factory.
 *
 * The contract tests build their own Injector and supply the factory via
 * `KLINE_CHART_FACTORY` directly, so this default is transparent to them.
 */
export const KLINE_CHART_FACTORY = new InjectionToken<ChartControllerFactory | null>(
    'KLINE_CHART_FACTORY',
    { providedIn: 'root', factory: (): ChartControllerFactory => createChartController },
)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ProvideKLineChartOptions {
    theme?: 'light' | 'dark'
    factory?: ChartControllerFactory
}

/**
 * DI provider factory. Usage:
 *
 *   providers: [provideKLineChart({ theme: 'dark', factory: createChartController })]
 */
export function provideKLineChart(opts: ProvideKLineChartOptions = {}): Provider[] {
    const providers: Provider[] = []
    if (opts.theme !== undefined) {
        providers.push({ provide: KLINE_CHART_THEME, useValue: opts.theme })
    }
    if (opts.factory !== undefined) {
        providers.push({ provide: KLINE_CHART_FACTORY, useValue: opts.factory })
    }
    return providers
}

// ---------------------------------------------------------------------------
// Signal bridge: core Signal<T> -> Angular Signal<T>
// ---------------------------------------------------------------------------

/**
 * Wrap a core signal into an Angular readonly signal. Unsubscribes via
 * the supplied `DestroyRef` — or, if omitted, `inject(DestroyRef)` from
 * the surrounding injection context (constructor / factory of a directive
 * / component / service).
 *
 * Explicit `destroyRef` lets non-component contexts (tests, services with
 * custom lifetimes) drive cleanup without relying on `inject()`, which is
 * special-cased for DestroyRef and only resolves correctly inside a
 * NodeInjector / view.
 */
export function coreSignalToAngular<T>(
    source: CoreSignal<T>,
    destroyRef?: DestroyRef,
): NgSignal<T> {
    const ng = signal<T>(source.peek())
    const unsubscribe = source.subscribe(() => {
        ng.set(source.peek())
    })
    const ref = destroyRef ?? inject(DestroyRef)
    ref.onDestroy(unsubscribe)
    return ng.asReadonly()
}

// ---------------------------------------------------------------------------
// createChart — imperative escape hatch
// ---------------------------------------------------------------------------

/**
 * Imperative escape hatch. Mirrors React/Vue.
 *
 * Defaults to the production `createChartController` from
 * `@klinechart-quant/core` — the same factory the standalone component uses
 * when no DI override is provided. Callers can pass `opts.factory` to
 * substitute (e.g. mock in tests, or wire a custom backing engine).
 *
 * Throws only when `container` is null/undefined (the one truly unrecoverable
 * pre-condition). Closes DX BLOCKER-006: no spurious factory-not-registered
 * error on the happy path.
 */
export function createChart(
    opts: ChartMountOptions & { factory?: ChartControllerFactory },
): ChartController {
    if (opts.container === null || opts.container === undefined) {
        throw new Error('createChart: container is required')
    }
    const factory: ChartControllerFactory = opts.factory ?? createChartController
    const { factory: _ignored, ...mountOpts } = opts
    void _ignored
    return factory(mountOpts)
}

// ---------------------------------------------------------------------------
// <kline-chart> standalone component
// ---------------------------------------------------------------------------

@Component({
    selector: 'kline-chart',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<div #container style="width:100%;height:100%;"></div>',
})
export class KLineChartComponent implements AfterViewInit, OnDestroy {
    @Input() data: ReadonlyArray<KLineData> = []
    @Input() theme: 'light' | 'dark' | undefined = undefined
    @Input() initialZoomLevel: number | undefined = undefined

    @ViewChild('container', { static: true })
    container!: ElementRef<HTMLElement>

    /** Angular signal mirroring the controller viewport. Drives OnPush refresh. */
    viewport: NgSignal<ChartViewport | null> = signal<ChartViewport | null>(null)

    /** Underlying core controller; null until ngAfterViewInit (SSR or pre-mount). */
    controller: ChartController | null = null

    private readonly platformId = inject(PLATFORM_ID)
    private readonly defaultTheme = inject(KLINE_CHART_THEME)
    private readonly factory = inject(KLINE_CHART_FACTORY)
    private readonly destroyRef = inject(DestroyRef)
    private viewportUnsub: (() => void) | null = null

    ngAfterViewInit(): void {
        // SSR guard — never touch DOM on the server.
        if (!isPlatformBrowser(this.platformId)) return

        const containerEl = this.container?.nativeElement ?? null
        if (containerEl === null) {
            // Defensive: ViewChild static:true should populate this synchronously.
            return
        }
        if (typeof this.factory !== 'function') {
            throw new Error(
                '<kline-chart>: no ChartControllerFactory registered. Add provideKLineChart({ factory }) at the application bootstrap.',
            )
        }

        const controller = createChart({
            container: containerEl,
            data: this.data,
            initialZoomLevel: this.initialZoomLevel,
            theme: this.theme ?? this.defaultTheme,
            factory: this.factory,
        })
        this.controller = controller

        // Bridge core viewport signal into Angular signal for OnPush refresh.
        const ngViewport = signal<ChartViewport | null>(controller.viewport.peek())
        const unsub = controller.viewport.subscribe(() => {
            ngViewport.set(controller.viewport.peek())
        })
        this.viewportUnsub = unsub
        this.destroyRef.onDestroy(unsub)
        this.viewport = ngViewport.asReadonly()
    }

    ngOnDestroy(): void {
        if (this.viewportUnsub !== null) {
            try {
                this.viewportUnsub()
            } catch {
                /* ignore */
            }
            this.viewportUnsub = null
        }
        if (this.controller !== null) {
            try {
                this.controller.dispose()
            } finally {
                this.controller = null
            }
        }
    }
}
