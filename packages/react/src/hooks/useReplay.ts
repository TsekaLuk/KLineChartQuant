import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
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
    state: ReplayState
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
    const controllerRef = useRef<ReplayController | null>(opts.controller ?? null)
    if (controllerRef.current === null) {
        const init: { start?: number; end?: number; pacing?: ReplayPacing; speed?: number } = {}
        if (opts.start !== undefined) init.start = opts.start
        if (opts.end !== undefined) init.end = opts.end
        if (opts.pacing !== undefined) init.pacing = opts.pacing
        if (opts.speed !== undefined) init.speed = opts.speed
        controllerRef.current = createReplayController(init)
    }
    const c = controllerRef.current

    useEffect(() => {
        const ctl = controllerRef.current
        return () => {
            if (opts.controller === undefined && ctl !== null) ctl.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const subscribe = useMemo(() => (cb: () => void) => c.state.subscribe(cb), [c])
    const getSnapshot = useCallback(() => c.state(), [c])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

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
