/**
 * Hooks for the 7 controllers beyond `useChart` / `useIndicatorSelector`.
 *
 * Pattern (uniform across every hook):
 *   1. Lazy-init the underlying controller via `useRef` so it survives renders.
 *   2. Dispose on unmount via `useEffect(() => () => controller.dispose(), [])`.
 *   3. Bridge each public Signal<T> into React state via `useSyncExternalStore`
 *      with stable `subscribe` (`useMemo`) and `getSnapshot` (`useCallback`) —
 *      tearing-safe under React 18+/19 concurrent rendering.
 *   4. Return `{ ...state, ...mutators }`. Mutators are pre-bound to the
 *      controller so callers can pass them directly to event handlers.
 *
 * SSR contract: the hooks are safe to import from a server file. They become
 * active only when the host component commits in the browser. No `window`
 * reference at module top level.
 */

export { useAlerts } from './useAlerts'
export { useReplay } from './useReplay'
export { useFootprint } from './useFootprint'
export { useVolumeProfile } from './useVolumeProfile'
export { useAnchoredVwap } from './useAnchoredVwap'
export { useOrderBookHeatmap } from './useOrderBookHeatmap'
export { useMtfOverlay } from './useMtfOverlay'
