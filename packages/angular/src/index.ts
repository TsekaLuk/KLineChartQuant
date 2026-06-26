/**
 * @klinechart-quant/angular — public API surface.
 *
 * Standalone Angular 17+/18+/19+ bindings for @klinechart-quant/core.
 * No NgModule. Bridges the core push-based signal layer into Angular's
 * own `signal()` so OnPush components refresh when controllers mutate state.
 */

import { KLineChartError } from '@klinechart-quant/core'

import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    EventEmitter,
    InjectionToken,
    Input,
    OnDestroy,
    Output,
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
        throw new KLineChartError('CONTROLLER_CONFIG_INVALID', 'createChart: container is required')
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

    /**
     * Controlled fullscreen flag. When it transitions to true the root host
     * element enters browser fullscreen; when false it exits. Browser-driven
     * changes (Esc / F11) are reflected back via the `fullscreenChange` output.
     * Default false. Uses a setter so the transition fires immediately once the
     * view is initialised; transitions requested before ngAfterViewInit are
     * replayed against the live state at mount.
     */
    @Input()
    get fullscreen(): boolean {
        return this._fullscreen
    }
    set fullscreen(value: boolean) {
        const next = value === true
        if (next === this._fullscreen) return
        this._fullscreen = next
        // Only act once the host element exists (post-AfterViewInit). Pre-mount
        // transitions are applied in syncFullscreen() during ngAfterViewInit.
        if (this.viewInitialised) {
            this.syncFullscreen()
        }
    }

    /** Reflects browser-driven fullscreen changes back to the consumer. */
    @Output() fullscreenChange = new EventEmitter<boolean>()

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

    private _fullscreen = false
    private viewInitialised = false
    private fullscreenChangeUnsub: (() => void) | null = null

    ngAfterViewInit(): void {
        // SSR guard — never touch DOM on the server.
        if (!isPlatformBrowser(this.platformId)) return

        const containerEl = this.container?.nativeElement ?? null
        if (containerEl === null) {
            // Defensive: ViewChild static:true should populate this synchronously.
            return
        }
        if (typeof this.factory !== 'function') {
            throw new KLineChartError(
                'CONTROLLER_CONFIG_INVALID',
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

        // Fullscreen: pure DOM concern on the existing root host element.
        // Register the browser-driven 'fullscreenchange' listener and replay
        // any controlled-prop transition requested before the view existed.
        this.registerFullscreenListener()
        this.viewInitialised = true
        this.syncFullscreen()
    }

    ngOnDestroy(): void {
        if (this.fullscreenChangeUnsub !== null) {
            try {
                this.fullscreenChangeUnsub()
            } catch {
                /* ignore */
            }
            this.fullscreenChangeUnsub = null
        }
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
        this.viewInitialised = false
    }

    // -----------------------------------------------------------------------
    // Fullscreen — SSR / jsdom safe. Every document/element access is guarded
    // and the Fullscreen API methods are feature-detected before calling, since
    // jsdom does not implement them.
    // -----------------------------------------------------------------------

    private get rootElement(): HTMLElement | null {
        return this.container?.nativeElement ?? null
    }

    private syncFullscreen(): void {
        if (this._fullscreen) {
            this.requestFullscreen()
        } else {
            this.exitFullscreen()
        }
    }

    private requestFullscreen(): void {
        if (typeof document === 'undefined') return
        const el = this.rootElement
        if (el === null) return
        if (typeof el.requestFullscreen !== 'function') return
        // Browser returns a Promise; swallow rejection (e.g. no user gesture)
        // without throwing so the controlled input stays the source of truth.
        void Promise.resolve(el.requestFullscreen()).catch(() => {})
    }

    private exitFullscreen(): void {
        if (typeof document === 'undefined') return
        if (document.fullscreenElement === null || document.fullscreenElement === undefined) return
        if (typeof document.exitFullscreen !== 'function') return
        void Promise.resolve(document.exitFullscreen()).catch(() => {})
    }

    private registerFullscreenListener(): void {
        if (typeof document === 'undefined') return
        const handler = (): void => {
            if (typeof document === 'undefined') return
            this.fullscreenChange.emit(document.fullscreenElement === this.rootElement)
        }
        document.addEventListener('fullscreenchange', handler)
        this.fullscreenChangeUnsub = () => {
            document.removeEventListener('fullscreenchange', handler)
        }
        this.destroyRef.onDestroy(this.fullscreenChangeUnsub)
    }
}

// Re-export the 7 injection-context bindings from `./bindings.ts`. These
// pair with the existing KLineChartComponent + coreSignalToAngular + the
// provideKLineChart provider to give every public controller in
// @klinechart-quant/core an idiomatic Angular 17+ binding.
export {
    injectAlerts,
    injectReplay,
    injectFootprint,
    injectVolumeProfile,
    injectAnchoredVwap,
    injectOrderBookHeatmap,
    injectMtfOverlay,
} from './bindings'

export type {
    InjectAlertsOpts,
    InjectAlertsResult,
    InjectReplayOpts,
    InjectReplayResult,
    InjectFootprintOpts,
    InjectFootprintResult,
    InjectVolumeProfileOpts,
    InjectVolumeProfileResult,
    InjectAnchoredVwapOpts,
    InjectAnchoredVwapResult,
    InjectOrderBookHeatmapOpts,
    InjectOrderBookHeatmapResult,
    InjectMtfOverlayOpts,
    InjectMtfOverlayResult,
} from './bindings'
