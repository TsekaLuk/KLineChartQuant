import { CANONICAL_TOOL_REGISTRY, type ToolDefinition } from './toolRegistry.js'

import type { McpToolSchema } from './types.js'

function legacySafety(tool: ToolDefinition): McpToolSchema['safety'] {
  switch (tool.policy.safety) {
    case 'read-only':
      return 'readonly'
    case 'reversible-write':
      return 'mutates-state'
    case 'destructive':
    case 'external-side-effect':
      return 'destroys-state'
  }
}

function legacyView(tool: ToolDefinition): McpToolSchema {
  return Object.freeze({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    safety: legacySafety(tool),
  })
}

function toolsMatching(predicate: (tool: ToolDefinition) => boolean): readonly McpToolSchema[] {
  return Object.freeze(CANONICAL_TOOL_REGISTRY.list().filter(predicate).map(legacyView))
}

/** @deprecated Use CANONICAL_TOOL_REGISTRY.project() for model-visible tools. */
export const ALL_TOOLS = toolsMatching(() => true)

/** @deprecated Compatibility views generated from the canonical registry. */
export const AGENT_TOOLS = toolsMatching((tool) => tool.name.startsWith('agent.'))
/** @deprecated Compatibility views generated from the canonical registry. */
export const CHART_NAVIGATION_TOOLS = toolsMatching(
  (tool) => tool.name.startsWith('chart.') || tool.name.startsWith('navigation.'),
)
/** @deprecated Compatibility views generated from the canonical registry. */
export const INDICATOR_TOOLS = toolsMatching((tool) => tool.name.startsWith('indicators.'))
/** @deprecated Compatibility views generated from the canonical registry. */
export const DATA_TOOLS = toolsMatching((tool) => tool.name.startsWith('data.'))
/** @deprecated Compatibility views generated from the canonical registry. */
export const DRAWING_TOOLS = toolsMatching((tool) => tool.name.startsWith('drawing.'))
/** @deprecated Compatibility views generated from the canonical registry. */
export const MARKER_TOOLS = toolsMatching((tool) => tool.name.startsWith('markers.'))
/** @deprecated Compatibility views generated from the canonical registry. */
export const SETTINGS_TOOLS = toolsMatching((tool) => tool.name.startsWith('settings.'))
/** @deprecated Compatibility views generated from the canonical registry. */
export const ALERT_TOOLS = toolsMatching((tool) => tool.name.startsWith('alerts.'))
/** @deprecated Compatibility views generated from the canonical registry. */
export const REPLAY_TOOLS = toolsMatching((tool) => tool.name.startsWith('replay.'))

/** @deprecated Compatibility grouping generated from the canonical registry. */
export const TOOL_GROUPS = Object.freeze({
  agent: AGENT_TOOLS,
  navigation: CHART_NAVIGATION_TOOLS,
  indicators: INDICATOR_TOOLS,
  data: DATA_TOOLS,
  drawing: DRAWING_TOOLS,
  markers: MARKER_TOOLS,
  settings: SETTINGS_TOOLS,
  alerts: ALERT_TOOLS,
  replay: REPLAY_TOOLS,
})

/** @deprecated Use CANONICAL_TOOL_REGISTRY.find(). */
export function findTool(name: string): McpToolSchema | undefined {
  const tool = CANONICAL_TOOL_REGISTRY.find(name)
  return tool ? legacyView(tool) : undefined
}
