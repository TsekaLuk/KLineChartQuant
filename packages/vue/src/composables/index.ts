/**
 * Vue 3 composables for the 7 controllers beyond `useChart` /
 * `useIndicatorSelector`. Pattern is uniform:
 *
 *   1. Lazy-create the controller (or accept an externally-owned one).
 *   2. Bridge each `Signal<T>` into a `shallowRef<T>` via a direct
 *      `signal.subscribe(...)` — bypasses Vue's deep reactivity (which
 *      would wastefully proxy our immutable signal payloads).
 *   3. Register a single `onScopeDispose` that unsubscribes AND disposes the
 *      controller (only if we created it). Works inside SFC `<script setup>`,
 *      inside a manually-created `effectScope`, or inside another composable.
 *   4. Return `{ ...refs, ...mutators-pre-bound }`.
 *
 * SSR contract: composables can be safely imported from server-rendered files.
 * The subscriptions become active only when the host component's setup runs in
 * a browser context — there is no module-scope DOM access.
 */

export { useAlerts } from './useAlerts'
export { useReplay } from './useReplay'
export { useFootprint } from './useFootprint'
export { useVolumeProfile } from './useVolumeProfile'
export { useAnchoredVwap } from './useAnchoredVwap'
export { useOrderBookHeatmap } from './useOrderBookHeatmap'
export { useMtfOverlay } from './useMtfOverlay'
