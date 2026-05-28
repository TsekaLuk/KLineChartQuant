import { onScopeDispose, shallowRef, type Ref } from 'vue'
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
    state: Ref<VolumeProfileState | null>
    config: Ref<VolumeProfileConfig>
    ingest(bars: ReadonlyArray<VolumeProfileBar>): void
    setConfig(next: Partial<VolumeProfileConfig>): void
    reset(): void
}

export function useVolumeProfile(opts: UseVolumeProfileOpts = {}): UseVolumeProfileResult {
    const initOpts: { config?: Partial<VolumeProfileConfig> } = {}
    if (opts.config !== undefined) initOpts.config = opts.config
    const c = opts.controller ?? createVolumeProfileController(initOpts)
    const ownsController = opts.controller === undefined

    const state = shallowRef<VolumeProfileState | null>(c.state.peek())
    const config = shallowRef<VolumeProfileConfig>(c.config.peek())
    const stopState = c.state.subscribe(() => {
        state.value = c.state()
    })
    const stopConfig = c.config.subscribe(() => {
        config.value = c.config()
    })

    onScopeDispose(() => {
        stopState()
        stopConfig()
        if (ownsController) c.dispose()
    })

    return {
        state,
        config,
        ingest: c.ingest.bind(c),
        setConfig: c.setConfig.bind(c),
        reset: c.reset.bind(c),
    }
}
