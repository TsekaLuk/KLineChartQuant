import { onScopeDispose, shallowRef, type Ref } from 'vue'
import {
    createReplayController,
    type ReplayController,
    type ReplayPacing,
    type ReplayState,
} from '@klinechart-quant/core'

export interface UseReplayOpts {
    start?: number
    end?: number
    pacing?: ReplayPacing
    speed?: number
    controller?: ReplayController
}

export interface UseReplayResult {
    state: Ref<ReplayState>
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

export function useReplay(opts: UseReplayOpts = {}): UseReplayResult {
    const initOpts: { start?: number; end?: number; pacing?: ReplayPacing; speed?: number } = {}
    if (opts.start !== undefined) initOpts.start = opts.start
    if (opts.end !== undefined) initOpts.end = opts.end
    if (opts.pacing !== undefined) initOpts.pacing = opts.pacing
    if (opts.speed !== undefined) initOpts.speed = opts.speed
    const c = opts.controller ?? createReplayController(initOpts)
    const ownsController = opts.controller === undefined

    const state = shallowRef<ReplayState>(c.state.peek())
    const stop = c.state.subscribe(() => {
        state.value = c.state()
    })

    onScopeDispose(() => {
        stop()
        if (ownsController) c.dispose()
    })

    return {
        state,
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
