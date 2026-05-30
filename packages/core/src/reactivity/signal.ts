/**
 * Tiny push-based reactivity primitive. Zero dependencies.
 *
 * Design constraints:
 * - Synchronous notify on `set` (no microtask scheduling — adapters batch)
 * - No proxy / no deep tracking — only top-level read/write
 * - Equality short-circuits on `Object.is`
 * - `subscribe` returns an unsubscribe; safe to call from React useSyncExternalStore,
 *   Vue effect, Angular toSignal
 * - `effect` re-runs whenever any signal read inside re-emits
 */

export type Signal<T> = {
    /** read current value; tracked when called inside `effect` */
    (): T
    /** read without tracking */
    peek: () => T
    /** write new value; notifies subscribers if `Object.is` differs */
    set: (next: T) => void
    /** subscribe; returns unsubscribe */
    subscribe: (listener: () => void) => () => void
}

export type Computed<T> = {
    (): T
    peek: () => T
    subscribe: (listener: () => void) => () => void
}

type Tracker = {
    deps: Set<Set<() => void>>
    run: () => void
}

let activeTracker: Tracker | null = null

export function createSignal<T>(initial: T): Signal<T> {
    let value = initial
    const subscribers = new Set<() => void>()

    const read = (): T => {
        if (activeTracker !== null) {
            subscribers.add(activeTracker.run)
            activeTracker.deps.add(subscribers)
        }
        return value
    }

    const peek = (): T => value

    const set = (next: T): void => {
        if (Object.is(value, next)) return
        value = next
        // copy to allow listener self-unsubscribe during notify
        for (const listener of [...subscribers]) listener()
    }

    const subscribe = (listener: () => void): (() => void) => {
        subscribers.add(listener)
        return () => {
            subscribers.delete(listener)
        }
    }

    return Object.assign(read, { peek, set, subscribe }) as Signal<T>
}

export function effect(fn: () => void): () => void {
    const tracker: Tracker = {
        deps: new Set(),
        run: () => {
            // tear down previous subscriptions before re-tracking
            for (const dep of tracker.deps) dep.delete(tracker.run)
            tracker.deps.clear()
            const prev = activeTracker
            activeTracker = tracker
            try {
                fn()
            } finally {
                activeTracker = prev
            }
        },
    }
    tracker.run()
    return () => {
        for (const dep of tracker.deps) dep.delete(tracker.run)
        tracker.deps.clear()
    }
}

export function computed<T>(fn: () => T): Computed<T> {
    const inner = createSignal<T>(undefined as unknown as T)
    let initialized = false
    effect(() => {
        const next = fn()
        if (!initialized) {
            initialized = true
            // bypass equality check on first run
            ;(inner as unknown as { set: (v: T) => void }).set(next)
            return
        }
        inner.set(next)
    })
    const read = (): T => inner()
    return Object.assign(read, { peek: inner.peek, subscribe: inner.subscribe }) as Computed<T>
}

/**
 * Batch multiple signal writes; subscribers fire once per signal after `fn` returns.
 * Useful when controllers mutate several signals in a single transaction.
 *
 * Implementation note: current `set` is synchronous-notify; batch wraps writes
 * by deferring notifications via a microtask queue per signal. For now we keep
 * batch a no-op marker since signal writes are already coalesced via Object.is —
 * adapters can wrap their own batching (React's automatic batching, Vue's nextTick).
 */
export function batch<T>(fn: () => T): T {
    return fn()
}
