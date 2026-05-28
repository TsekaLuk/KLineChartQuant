import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
    createVolumeProfileController,
    type VolumeProfileBar,
    type VolumeProfileConfig,
    type VolumeProfileController,
    type VolumeProfileState,
} from '@klinechart-quant/core'

export interface UseVolumeProfileOpts {
    config?: Partial<VolumeProfileConfig>
    controller?: VolumeProfileController
}

export interface UseVolumeProfileResult {
    state: VolumeProfileState | null
    config: VolumeProfileConfig
    ingest(bars: ReadonlyArray<VolumeProfileBar>): void
    setConfig(next: Partial<VolumeProfileConfig>): void
    reset(): void
}

export function useVolumeProfile(opts: UseVolumeProfileOpts = {}): UseVolumeProfileResult {
    const controllerRef = useRef<VolumeProfileController | null>(opts.controller ?? null)
    if (controllerRef.current === null) {
        const init: { config?: Partial<VolumeProfileConfig> } = {}
        if (opts.config !== undefined) init.config = opts.config
        controllerRef.current = createVolumeProfileController(init)
    }
    const c = controllerRef.current

    useEffect(() => {
        const ctl = controllerRef.current
        return () => {
            if (opts.controller === undefined && ctl !== null) ctl.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const subscribeState = useMemo(() => (cb: () => void) => c.state.subscribe(cb), [c])
    const getStateSnapshot = useCallback(() => c.state(), [c])
    const state = useSyncExternalStore(subscribeState, getStateSnapshot, getStateSnapshot)

    const subscribeConfig = useMemo(() => (cb: () => void) => c.config.subscribe(cb), [c])
    const getConfigSnapshot = useCallback(() => c.config(), [c])
    const config = useSyncExternalStore(subscribeConfig, getConfigSnapshot, getConfigSnapshot)

    return {
        state,
        config,
        ingest: c.ingest.bind(c),
        setConfig: c.setConfig.bind(c),
        reset: c.reset.bind(c),
    }
}
