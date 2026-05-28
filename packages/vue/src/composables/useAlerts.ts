import { onScopeDispose, shallowRef, type Ref } from 'vue'
import {
    createAlertController,
    type AlertController,
    type AlertEvent,
    type AlertRule,
    type MarketSnapshot,
} from '@klinechart-quant/core'

export interface UseAlertsOpts {
    maxEvents?: number
    /** Bind to an externally-managed controller instead of creating one. */
    controller?: AlertController
}

export interface UseAlertsResult {
    rules: Ref<ReadonlyArray<AlertRule>>
    events: Ref<ReadonlyArray<AlertEvent>>
    addRule(rule: AlertRule): boolean
    removeRule(id: string): boolean
    setRuleEnabled(id: string, enabled: boolean): boolean
    updateRule(id: string, patch: Partial<Omit<AlertRule, 'id'>>): boolean
    evaluate(snapshot: MarketSnapshot, now: number): ReadonlyArray<AlertEvent>
    clearEvents(): void
}

export function useAlerts(opts: UseAlertsOpts = {}): UseAlertsResult {
    const c =
        opts.controller ??
        createAlertController(opts.maxEvents !== undefined ? { maxEvents: opts.maxEvents } : {})
    const ownsController = opts.controller === undefined

    const rules = shallowRef<ReadonlyArray<AlertRule>>(c.rules.peek())
    const events = shallowRef<ReadonlyArray<AlertEvent>>(c.events.peek())
    const stopRules = c.rules.subscribe(() => {
        rules.value = c.rules()
    })
    const stopEvents = c.events.subscribe(() => {
        events.value = c.events()
    })

    onScopeDispose(() => {
        stopRules()
        stopEvents()
        if (ownsController) c.dispose()
    })

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
