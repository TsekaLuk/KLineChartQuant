/**
 * Chart state serialization — `serialize(chartSnapshot)` + `deserialize(json)`.
 *
 * What this gives us: AI-generated "analysis templates" round-trip across
 * sessions. The user says "give me a setup for swing trading BTC", the LLM
 * generates a `SerializedChartState` JSON, the runtime loads it. No code
 * generation, no eval; the LLM only composes from existing capabilities.
 *
 * This is the safe-by-construction generative UI form §10.3 calls out.
 */

import { KLineChartError, type KLineChartErrorCode } from '@klinechart-quant/core'
import type { SerializedChartState } from './types'

const SCHEMA_VERSION = 1 as const

/**
 * Now an alias for the cross-package {@link KLineChartError} base
 * (API audit BLOCKER-005). All codes used here
 * (`INVALID_JSON` / `NOT_OBJECT` / `SCHEMA_VERSION_MISMATCH` /
 * `INVALID_TIMESTAMP` / `MISSING_CONTROLLERS`) are part of
 * {@link KLineChartErrorCode} and `instanceof KLineChartError` is true
 * for instances thrown by `deserialize()`.
 *
 * Kept exported under the old name so existing consumers don't break;
 * prefer `KLineChartError` going forward.
 *
 * @deprecated Use `KLineChartError` from `@klinechart-quant/core` instead.
 */
export class ChartSerializationError extends KLineChartError {
    constructor(code: KLineChartErrorCode, message: string) {
        super(code, message)
        this.name = 'ChartSerializationError'
    }
}

/**
 * Input shape — the caller harvests it from their chart controller(s) and
 * passes it in. The serialization layer is intentionally pure: it does not
 * peek inside controllers.
 */
export interface ChartSnapshotInput {
    label?: string
    viewport?: { zoomLevel: number; visibleFrom: number; visibleTo: number }
    theme?: 'light' | 'dark'
    indicators?: ReadonlyArray<{
        definitionId: string
        params: Readonly<Record<string, number | string | boolean>>
    }>
    alerts?: ReadonlyArray<{
        id: string
        name: string
        predicate: unknown // validated downstream by the alerts module
        oneShot: boolean
        cooldownMs?: number
    }>
}

export function serialize(snapshot: ChartSnapshotInput): SerializedChartState {
    const controllers: SerializedChartState['controllers'] = {}
    if (snapshot.viewport !== undefined) controllers.viewport = snapshot.viewport
    if (snapshot.theme !== undefined) controllers.theme = snapshot.theme
    if (snapshot.indicators !== undefined) controllers.indicators = snapshot.indicators
    if (snapshot.alerts !== undefined) controllers.alerts = snapshot.alerts
    const out: SerializedChartState = {
        schemaVersion: SCHEMA_VERSION,
        snapshotTakenAt: new Date().toISOString(),
        controllers,
    }
    if (snapshot.label !== undefined) out.label = snapshot.label
    return out
}

export function deserialize(json: string): SerializedChartState {
    let parsed: unknown
    try {
        parsed = JSON.parse(json)
    } catch (err) {
        throw new ChartSerializationError(
            'INVALID_JSON',
            `Could not parse SerializedChartState as JSON: ${(err as Error).message}`,
        )
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new ChartSerializationError(
            'NOT_OBJECT',
            'SerializedChartState root must be an object.',
        )
    }
    const root = parsed as Partial<SerializedChartState>
    if (root.schemaVersion !== SCHEMA_VERSION) {
        throw new ChartSerializationError(
            'SCHEMA_VERSION_MISMATCH',
            `Expected schemaVersion ${SCHEMA_VERSION}, got ${String(root.schemaVersion)}.`,
        )
    }
    if (typeof root.snapshotTakenAt !== 'string' || Number.isNaN(Date.parse(root.snapshotTakenAt))) {
        throw new ChartSerializationError(
            'INVALID_TIMESTAMP',
            'snapshotTakenAt must be an ISO 8601 string.',
        )
    }
    if (typeof root.controllers !== 'object' || root.controllers === null) {
        throw new ChartSerializationError(
            'MISSING_CONTROLLERS',
            'controllers object is required.',
        )
    }
    return root as SerializedChartState
}
