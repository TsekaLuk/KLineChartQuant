import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
    createAlertController,
    type AlertController,
    type AlertEvent,
    type AlertRule,
    type MarketSnapshot,
} from '@klinechart-quant/core'

export interface UseAlertsOpts {
    /** Max events buffered on the controller; older drop. Default 100. */
    maxEvents?: number
    /** Pass to bind to an externally-managed controller instead of creating one. */
    controller?: AlertController
}

export interface UseAlertsResult {
    rules: ReadonlyArray<AlertRule>
    events: ReadonlyArray<AlertEvent>
    addRule(rule: AlertRule): boolean
    removeRule(id: string): boolean
    setRuleEnabled(id: string, enabled: boolean): boolean
    updateRule(id: string, patch: Partial<Omit<AlertRule, 'id'>>): boolean
    evaluate(snapshot: MarketSnapshot, now: number): ReadonlyArray<AlertEvent>
    clearEvents(): void
}

export function useAlerts(opts: UseAlertsOpts = {}): UseAlertsResult {
    const controllerRef = useRef<AlertController | null>(opts.controller ?? null)
    if (controllerRef.current === null) {
        const ctlOpts: { maxEvents?: number } = {}
        if (opts.maxEvents !== undefined) ctlOpts.maxEvents = opts.maxEvents
        controllerRef.current = createAlertController(ctlOpts)
    }
    const c = controllerRef.current

    useEffect(() => {
        const ctl = controllerRef.current
        return () => {
            // Only dispose if we created the controller internally.
            if (opts.controller === undefined && ctl !== null) ctl.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const subscribeRules = useMemo(() => (cb: () => void) => c.rules.subscribe(cb), [c])
    const getRulesSnapshot = useCallback(() => c.rules(), [c])
    const rules = useSyncExternalStore(subscribeRules, getRulesSnapshot, getRulesSnapshot)

    const subscribeEvents = useMemo(() => (cb: () => void) => c.events.subscribe(cb), [c])
    const getEventsSnapshot = useCallback(() => c.events(), [c])
    const events = useSyncExternalStore(subscribeEvents, getEventsSnapshot, getEventsSnapshot)

    return {
        rules,
        events,
        addRule: c.addRule.bind(c),
        removeRule: c.removeRule.bind(c),
        setRuleEnabled: c.setRuleEnabled.bind(c),
        updateRule: c.updateRule.bind(c),
        evaluate: c.evaluate.bind(c),
        clearEvents: c.clearEvents.bind(c),
    }
}
