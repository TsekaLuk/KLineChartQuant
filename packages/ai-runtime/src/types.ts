import type { TSchema } from 'typebox'

export interface McpToolSchema {
  name: string
  description: string
  inputSchema: TSchema
  outputSchema?: TSchema
  safety: 'readonly' | 'mutates-state' | 'destroys-state'
}

/** @deprecated Canonical tool contracts use TypeBox TSchema directly. */
export type JsonSchema = TSchema

export type { ControllerDescription } from '@363045841yyt/klinechart-core'

export interface ChartAlertsEntry {
  id: string
  name: string
  predicate: unknown
  oneShot: boolean
  cooldownMs?: number
}

export interface SerializedChartState {
  schemaVersion: 1
  snapshotTakenAt: string
  label?: string
  controllers: {
    viewport?: { zoomLevel: number; visibleFrom: number; visibleTo: number }
    theme?: 'light' | 'dark'
    indicators?: ReadonlyArray<{
      definitionId: string
      params: Readonly<Record<string, number | string | boolean>>
    }>
    alerts?: ReadonlyArray<ChartAlertsEntry>
  }
}
