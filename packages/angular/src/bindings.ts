/**
 * Angular 17+ injection-context bindings for the 7 controllers beyond the
 * already-shipped `<kline-chart>` standalone component + `coreSignalToAngular`
 * bridge.
 *
 * Each `injectXxx()` function is meant to be called inside a component or
 * service constructor (or anywhere `inject(...)` works). It:
 *
 *   1. Lazily creates the underlying controller (or accepts an externally-
 *      owned `opts.controller`).
 *   2. Bridges every public `Signal<T>` into an Angular `Signal<T>` via the
 *      existing `coreSignalToAngular` helper.
 *   3. Registers a `DestroyRef.onDestroy` cleanup that unsubscribes AND
 *      disposes the controller (only when we created it).
 *   4. Returns `{ ...angularSignals, ...mutators-pre-bound }`.
 *
 * SSR: the bindings never touch DOM at module load. The underlying
 * controllers are pure data; `injectXxx` does not throw on the server pass.
 * Callers gate any real ingestion behind `isPlatformBrowser`.
 */

import { DestroyRef, inject, type Signal as NgSignal } from '@angular/core'
import {
    createAlertController,
    createReplayController,
    createFootprintController,
    createVolumeProfileController,
    createAnchoredVwapController,
    createHeatmapController,
    createMtfController,
    type ActiveAnchor,
    type ActiveMtfSeries,
    type AlertController,
    type AlertEvent,
    type AlertRule,
    type AnchorDefinition,
    type AnchoredVwapController,
    type AVWAPBar,
    type BaseBar,
    type BookSnapshot,
    type FootprintBar,
    type FootprintConfig,
    type FootprintController,
    type HeatmapController,
    type HeatmapControllerConfig,
    type MarketSnapshot,
    type MtfController,
    type MtfSeriesDefinition,
    type OrderBookDelta,
    type ReplayController,
    type ReplayPacing,
    type ReplayState,
    type TradeWithFlag,
    type VolumeProfileBar,
    type VolumeProfileConfig,
    type VolumeProfileController,
    type VolumeProfileState,
} from '@klinechart-quant/core'

import { coreSignalToAngular } from './index'

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface InjectAlertsOpts {
    maxEvents?: number
    controller?: AlertController
}

export interface InjectAlertsResult {
    rules: NgSignal<ReadonlyArray<AlertRule>>
    events: NgSignal<ReadonlyArray<AlertEvent>>
    addRule(rule: AlertRule): boolean
    removeRule(id: string): boolean
    setRuleEnabled(id: string, enabled: boolean): boolean
    updateRule(id: string, patch: Partial<Omit<AlertRule, 'id'>>): boolean
    evaluate(snapshot: MarketSnapshot, now: number): ReadonlyArray<AlertEvent>
    clearEvents(): void
}

export function injectAlerts(opts: InjectAlertsOpts = {}): InjectAlertsResult {
    const ownsController = opts.controller === undefined
    const c =
        opts.controller ??
        createAlertController(opts.maxEvents !== undefined ? { maxEvents: opts.maxEvents } : {})

    const ref = inject(DestroyRef)
    if (ownsController) ref.onDestroy(() => c.dispose())

    return {
        rules: coreSignalToAngular(c.rules, ref),
        events: coreSignalToAngular(c.events, ref),
        addRule: c.addRule.bind(c),
        removeRule: c.removeRule.bind(c),
        setRuleEnabled: c.setRuleEnabled.bind(c),
        updateRule: c.updateRule.bind(c),
        evaluate: c.evaluate.bind(c),
        clearEvents: c.clearEvents.bind(c),
    }
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface InjectReplayOpts {
    start?: number
    end?: number
    pacing?: ReplayPacing
    speed?: number
    controller?: ReplayController
}

export interface InjectReplayResult {
    state: NgSignal<ReplayState>
    seekTo(position: number): void
    seekBy(delta: number): void
    stepForward(): void
    stepBackward(): void
    play(): void
    pause(): void
    toggle(): void
    setPacing(p: ReplayPacing): void
    setSpeed(s: number): void
    setRange(start: number, end: number): void
    tick(deltaMs: number): boolean
}

export function injectReplay(opts: InjectReplayOpts = {}): InjectReplayResult {
    const init: { start?: number; end?: number; pacing?: ReplayPacing; speed?: number } = {}
    if (opts.start !== undefined) init.start = opts.start
    if (opts.end !== undefined) init.end = opts.end
    if (opts.pacing !== undefined) init.pacing = opts.pacing
    if (opts.speed !== undefined) init.speed = opts.speed
    const ownsController = opts.controller === undefined
    const c = opts.controller ?? createReplayController(init)

    const ref = inject(DestroyRef)
    if (ownsController) ref.onDestroy(() => c.dispose())

    return {
        state: coreSignalToAngular(c.state, ref),
        seekTo: c.seekTo.bind(c),
        seekBy: c.seekBy.bind(c),
        stepForward: c.stepForward.bind(c),
        stepBackward: c.stepBackward.bind(c),
        play: c.play.bind(c),
        pause: c.pause.bind(c),
        toggle: c.toggle.bind(c),
        setPacing: c.setPacing.bind(c),
        setSpeed: c.setSpeed.bind(c),
        setRange: c.setRange.bind(c),
        tick: c.tick.bind(c),
    }
}

// ---------------------------------------------------------------------------
// Footprint
// ---------------------------------------------------------------------------

export interface InjectFootprintOpts {
    config: FootprintConfig
    controller?: FootprintController
}

export interface InjectFootprintResult {
    bars: NgSignal<ReadonlyArray<FootprintBar>>
    cumulativeDelta: NgSignal<ReadonlyArray<number>>
    ingestTrade(trade: TradeWithFlag, bid?: number, ask?: number): void
    setConfig(next: Partial<FootprintConfig>): void
    reset(): void
}

export function injectFootprint(opts: InjectFootprintOpts): InjectFootprintResult {
    const ownsController = opts.controller === undefined
    const c = opts.controller ?? createFootprintController(opts.config)

    const ref = inject(DestroyRef)
    if (ownsController) ref.onDestroy(() => c.dispose())

    return {
        bars: coreSignalToAngular(c.bars, ref),
        cumulativeDelta: coreSignalToAngular(c.cumulativeDelta, ref),
        ingestTrade: c.ingestTrade.bind(c),
        setConfig: c.setConfig.bind(c),
        reset: c.reset.bind(c),
    }
}

// ---------------------------------------------------------------------------
// Volume Profile
// ---------------------------------------------------------------------------

export interface InjectVolumeProfileOpts {
    config?: Partial<VolumeProfileConfig>
    controller?: VolumeProfileController
}

export interface InjectVolumeProfileResult {
    state: NgSignal<VolumeProfileState | null>
    config: NgSignal<VolumeProfileConfig>
    ingest(bars: ReadonlyArray<VolumeProfileBar>): void
    setConfig(next: Partial<VolumeProfileConfig>): void
    reset(): void
}

export function injectVolumeProfile(opts: InjectVolumeProfileOpts = {}): InjectVolumeProfileResult {
    const init: { config?: Partial<VolumeProfileConfig> } = {}
    if (opts.config !== undefined) init.config = opts.config
    const ownsController = opts.controller === undefined
    const c = opts.controller ?? createVolumeProfileController(init)

    const ref = inject(DestroyRef)
    if (ownsController) ref.onDestroy(() => c.dispose())

    return {
        state: coreSignalToAngular(c.state, ref),
        config: coreSignalToAngular(c.config, ref),
        ingest: c.ingest.bind(c),
        setConfig: c.setConfig.bind(c),
        reset: c.reset.bind(c),
    }
}

// ---------------------------------------------------------------------------
// Anchored VWAP
// ---------------------------------------------------------------------------

export interface InjectAnchoredVwapOpts {
    initialBars?: ReadonlyArray<AVWAPBar>
    controller?: AnchoredVwapController
}

export interface InjectAnchoredVwapResult {
    anchors: NgSignal<ReadonlyArray<ActiveAnchor>>
    setBars(bars: ReadonlyArray<AVWAPBar>): void
    addAnchor(def: AnchorDefinition): string
    removeAnchor(id: string): boolean
    updateAnchor(id: string, patch: Partial<Omit<AnchorDefinition, 'id'>>): boolean
    appendBar(bar: AVWAPBar): void
}

export function injectAnchoredVwap(opts: InjectAnchoredVwapOpts = {}): InjectAnchoredVwapResult {
    const init: { initialBars?: ReadonlyArray<AVWAPBar> } = {}
    if (opts.initialBars !== undefined) init.initialBars = opts.initialBars
    const ownsController = opts.controller === undefined
    const c = opts.controller ?? createAnchoredVwapController(init)

    const ref = inject(DestroyRef)
    if (ownsController) ref.onDestroy(() => c.dispose())

    return {
        anchors: coreSignalToAngular(c.anchors, ref),
        setBars: c.setBars.bind(c),
        addAnchor: c.addAnchor.bind(c),
        removeAnchor: c.removeAnchor.bind(c),
        updateAnchor: c.updateAnchor.bind(c),
        appendBar: c.appendBar.bind(c),
    }
}

// ---------------------------------------------------------------------------
// Order Book Heatmap
// ---------------------------------------------------------------------------

export interface InjectOrderBookHeatmapOpts {
    config: HeatmapControllerConfig
    controller?: HeatmapController
}

export interface InjectOrderBookHeatmapResult {
    latestSnapshot: NgSignal<BookSnapshot | null>
    snapshotCount: NgSignal<number>
    deltaCount: NgSignal<number>
    ingestDelta(delta: OrderBookDelta): void
    forceSnapshot(): void
    replay(from: number, to: number, intervalMs: number): ReadonlyArray<BookSnapshot>
    setConfig(next: Partial<HeatmapControllerConfig>): void
}

export function injectOrderBookHeatmap(
    opts: InjectOrderBookHeatmapOpts,
): InjectOrderBookHeatmapResult {
    const ownsController = opts.controller === undefined
    const c = opts.controller ?? createHeatmapController(opts.config)

    const ref = inject(DestroyRef)
    if (ownsController) ref.onDestroy(() => c.dispose())

    // The heatmap controller exposes a single combined `state` signal;
    // split it into three individual NgSignals so consumers don't have
    // to destructure on every read.
    const state = coreSignalToAngular(c.state, ref)
    const latestSnapshot = ((): NgSignal<BookSnapshot | null> => {
        const s = state as unknown as () => { latestSnapshot: BookSnapshot | null }
        return (() => s().latestSnapshot) as NgSignal<BookSnapshot | null>
    })()
    const snapshotCount = ((): NgSignal<number> => {
        const s = state as unknown as () => { snapshotCount: number }
        return (() => s().snapshotCount) as NgSignal<number>
    })()
    const deltaCount = ((): NgSignal<number> => {
        const s = state as unknown as () => { deltaCount: number }
        return (() => s().deltaCount) as NgSignal<number>
    })()

    return {
        latestSnapshot,
        snapshotCount,
        deltaCount,
        ingestDelta: c.ingestDelta.bind(c),
        forceSnapshot: c.forceSnapshot.bind(c),
        replay: c.replay.bind(c),
        setConfig: c.setConfig.bind(c),
    }
}

// ---------------------------------------------------------------------------
// MTF Overlay
// ---------------------------------------------------------------------------

export interface InjectMtfOverlayOpts {
    initialBars?: ReadonlyArray<BaseBar>
    baseIntervalMs?: number
    controller?: MtfController
}

export interface InjectMtfOverlayResult {
    series: NgSignal<ReadonlyArray<ActiveMtfSeries>>
    setBaseBars(bars: ReadonlyArray<BaseBar>, intervalMs: number): void
    addSeries(def: MtfSeriesDefinition): string
    removeSeries(id: string): boolean
    updateSeries(id: string, patch: Partial<Omit<MtfSeriesDefinition, 'id'>>): boolean
    appendBaseBar(bar: BaseBar): void
}

export function injectMtfOverlay(opts: InjectMtfOverlayOpts = {}): InjectMtfOverlayResult {
    const init: { initialBars?: ReadonlyArray<BaseBar>; baseIntervalMs?: number } = {}
    if (opts.initialBars !== undefined) init.initialBars = opts.initialBars
    if (opts.baseIntervalMs !== undefined) init.baseIntervalMs = opts.baseIntervalMs
    const ownsController = opts.controller === undefined
    const c = opts.controller ?? createMtfController(init)

    const ref = inject(DestroyRef)
    if (ownsController) ref.onDestroy(() => c.dispose())

    return {
        series: coreSignalToAngular(c.series, ref),
        setBaseBars: c.setBaseBars.bind(c),
        addSeries: c.addSeries.bind(c),
        removeSeries: c.removeSeries.bind(c),
        updateSeries: c.updateSeries.bind(c),
        appendBaseBar: c.appendBaseBar.bind(c),
    }
}
