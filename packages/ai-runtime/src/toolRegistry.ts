import { Type, type TProperties, type TSchema } from 'typebox'
import { Compile, type Validator } from 'typebox/compile'

export const TOOL_REGISTRY_VERSION = '1.0.0'

export type ToolAudience = 'first-party' | 'mcp' | 'sdk'
export type ToolSafety = 'read-only' | 'reversible-write' | 'destructive' | 'external-side-effect'
export type ConfirmationMode = 'never' | 'when-inferred' | 'always'
export type ExecutionMode = 'parallel' | 'sequential'

export interface ToolPolicy {
  safety: ToolSafety
  confirmation: ConfirmationMode
  reversible: boolean
  execution: ExecutionMode
  timeoutMs: number
  syncCompatible: boolean
}

export interface ToolCapabilityContext {
  audience: ToolAudience
  supportedTools?: ReadonlySet<string>
  allowLegacyRawMutations?: boolean
  chartReady?: boolean
  features?: Readonly<Record<string, boolean>>
}

export interface ToolCapability {
  available: boolean
  reasonCode?: string
  reason?: string
}

export interface ToolError {
  code: string
  message: string
  retryable: boolean
  retryAfterMs?: number
  issues?: readonly ToolValidationIssue[]
  details?: Readonly<Record<string, unknown>>
}

export interface PostconditionResult {
  ok: boolean
  error?: Omit<ToolError, 'code'> & { code?: 'POSTCONDITION_FAILED' }
}

export interface ToolPostconditionContext {
  requestId: string
  sessionId: string
  runId: string
  turnId: string
  toolCallId: string
}

export interface ToolDefinition {
  name: string
  version: string
  title: string
  description: string
  inputSchema: TSchema
  outputSchema: TSchema
  audiences: readonly ToolAudience[]
  policy: Readonly<ToolPolicy>
  availability: Readonly<ToolCapability>
  requiresLegacyRawMutations: boolean
  capability(context: ToolCapabilityContext): ToolCapability
  verifyPostcondition?: (
    context: ToolPostconditionContext,
    input: unknown,
    output: unknown,
  ) => Promise<PostconditionResult> | PostconditionResult
}

export type ToolDefinitionInput = Omit<
  ToolDefinition,
  'availability' | 'capability' | 'requiresLegacyRawMutations'
> & {
  availability?: ToolCapability
  requiresLegacyRawMutations?: boolean
  capability?: (context: ToolCapabilityContext) => ToolCapability
}

export interface ToolValidationIssue {
  path: string
  schemaPath: string
  keyword: string
  message: string
}

export type ToolValidationResult =
  { ok: true; value: unknown } | { ok: false; issues: readonly ToolValidationIssue[] }

export interface ProjectedToolRegistry {
  registryVersion: string
  available: readonly ToolDefinition[]
  unavailable: readonly {
    name: string
    version: string
    capability: ToolCapability
  }[]
}

export interface SerializedToolRegistry {
  registryVersion: string
  tools: readonly {
    name: string
    version: string
    title: string
    description: string
    inputSchema: TSchema
    outputSchema: TSchema
    audiences: readonly ToolAudience[]
    policy: Readonly<ToolPolicy>
    availability: Readonly<ToolCapability>
    requiresLegacyRawMutations: boolean
  }[]
}

function unavailable(reasonCode: string, reason: string): ToolCapability {
  return { available: false, reasonCode, reason }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key])
  }
  return Object.freeze(value)
}

export function defineTool(input: ToolDefinitionInput): ToolDefinition {
  const availability = Object.freeze(input.availability ?? { available: true })
  const audiences = Object.freeze([...input.audiences])
  const policy = Object.freeze({ ...input.policy })
  const inputSchema = deepFreeze(input.inputSchema)
  const outputSchema = deepFreeze(input.outputSchema)
  const customCapability = input.capability
  const requiresLegacyRawMutations = input.requiresLegacyRawMutations ?? false

  const definition: ToolDefinition = {
    ...input,
    inputSchema,
    outputSchema,
    audiences,
    policy,
    availability,
    requiresLegacyRawMutations,
    capability(context) {
      if (!audiences.includes(context.audience)) {
        return unavailable('AUDIENCE_RESTRICTED', `Tool is not available to ${context.audience}.`)
      }
      if (!availability.available) return { ...availability }
      if (requiresLegacyRawMutations && !context.allowLegacyRawMutations) {
        return unavailable(
          'TRUSTED_CAPABILITY_REQUIRED',
          'Trusted raw mutation capability was not granted.',
        )
      }
      if (context.chartReady === false) {
        return unavailable('CHART_NOT_READY', 'No unique ready chart target is available.')
      }
      if (context.supportedTools && !context.supportedTools.has(input.name)) {
        return unavailable('HOST_UNSUPPORTED', 'The active host does not implement this tool.')
      }
      return customCapability?.(context) ?? { available: true }
    },
  }
  return Object.freeze(definition)
}

function validationIssues(validator: Validator, value: unknown): readonly ToolValidationIssue[] {
  return validator.Errors(value).map((error) => ({
    path: error.instancePath || '/',
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message,
  }))
}

export class ToolRegistry {
  readonly version: string
  private readonly tools: readonly ToolDefinition[]
  private readonly byName: ReadonlyMap<string, ToolDefinition>
  private readonly inputValidators: ReadonlyMap<string, Validator>
  private readonly outputValidators: ReadonlyMap<string, Validator>

  constructor(version: string, definitions: readonly ToolDefinition[]) {
    const byName = new Map<string, ToolDefinition>()
    const inputValidators = new Map<string, Validator>()
    const outputValidators = new Map<string, Validator>()
    const tools: ToolDefinition[] = []
    for (const definition of definitions) {
      const index = tools.findIndex((item) => item.name.localeCompare(definition.name) > 0)
      if (index === -1) tools.push(definition)
      else tools.splice(index, 0, definition)
    }

    for (const definition of tools) {
      if (byName.has(definition.name)) {
        throw new Error(`Duplicate canonical tool definition: ${definition.name}`)
      }
      byName.set(definition.name, definition)
      inputValidators.set(definition.name, Compile(definition.inputSchema))
      outputValidators.set(definition.name, Compile(definition.outputSchema))
    }

    this.version = version
    this.tools = Object.freeze(tools)
    this.byName = byName
    this.inputValidators = inputValidators
    this.outputValidators = outputValidators
  }

  list(): readonly ToolDefinition[] {
    return this.tools
  }

  find(name: string): ToolDefinition | undefined {
    return this.byName.get(name)
  }

  project(context: ToolCapabilityContext): ProjectedToolRegistry {
    const available: ToolDefinition[] = []
    const unavailableTools: ProjectedToolRegistry['unavailable'][number][] = []
    for (const tool of this.tools) {
      const capability = tool.capability(context)
      if (capability.available) available.push(tool)
      else unavailableTools.push({ name: tool.name, version: tool.version, capability })
    }
    return {
      registryVersion: this.version,
      available: Object.freeze(available),
      unavailable: Object.freeze(unavailableTools),
    }
  }

  validateInput(name: string, value: unknown): ToolValidationResult {
    return this.validate(this.inputValidators.get(name), value)
  }

  validateOutput(name: string, value: unknown): ToolValidationResult {
    return this.validate(this.outputValidators.get(name), value)
  }

  private validate(validator: Validator | undefined, value: unknown): ToolValidationResult {
    if (!validator) {
      return {
        ok: false,
        issues: [
          {
            path: '/',
            schemaPath: '/',
            keyword: 'unknownTool',
            message: 'The requested tool is not registered.',
          },
        ],
      }
    }
    return validator.Check(value)
      ? { ok: true, value }
      : { ok: false, issues: validationIssues(validator, value) }
  }
}

export function createToolRegistry(
  version: string,
  definitions: readonly ToolDefinition[],
): ToolRegistry {
  return new ToolRegistry(version, definitions)
}

export function serializeToolRegistry(registry: ToolRegistry): SerializedToolRegistry {
  return {
    registryVersion: registry.version,
    tools: registry.list().map((tool) => ({
      name: tool.name,
      version: tool.version,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      audiences: tool.audiences,
      policy: tool.policy,
      availability: tool.availability,
      requiresLegacyRawMutations: tool.requiresLegacyRawMutations,
    })),
  }
}

const strictObject = <Properties extends TProperties>(
  properties: Properties,
  options: Record<string, unknown> = {},
) => Type.Object(properties, { ...options, additionalProperties: false })
const emptyOutput = strictObject({})
const legacySettingsMap = Type.Record(Type.String({ minLength: 1 }), Type.Unknown())
const numberMap = Type.Record(Type.String({ minLength: 1 }), Type.Number())
const scalarMap = Type.Record(
  Type.String({ minLength: 1 }),
  Type.Union([Type.Number(), Type.String(), Type.Boolean()]),
)
const markerStyle = strictObject({
  fillColor: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  strokeColor: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  textColor: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  size: Type.Optional(Type.Number({ minimum: 4, maximum: 50 })),
  lineWidth: Type.Optional(Type.Number({ minimum: 0.5, maximum: 10 })),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
})
const audienceAll = ['first-party', 'mcp', 'sdk'] as const
const audienceTrusted = ['mcp', 'sdk'] as const
const version = '1.0.0'

function readPolicy(timeoutMs = 10_000): ToolPolicy {
  return {
    safety: 'read-only',
    confirmation: 'never',
    reversible: false,
    execution: 'parallel',
    timeoutMs,
    syncCompatible: false,
  }
}

function writePolicy(options: Partial<ToolPolicy> = {}): ToolPolicy {
  return {
    safety: 'reversible-write',
    confirmation: 'never',
    reversible: true,
    execution: 'sequential',
    timeoutMs: 10_000,
    syncCompatible: true,
    ...options,
  }
}

function forwardTool(input: Omit<ToolDefinitionInput, 'availability'>): ToolDefinition {
  return defineTool({
    ...input,
    availability: unavailable('NOT_IMPLEMENTED', 'The host implementation is not available yet.'),
  })
}

const contextRange = strictObject({
  from: Type.Number(),
  to: Type.Number(),
})
const indicatorInstance = strictObject({
  instanceId: Type.String({ minLength: 1 }),
  definitionId: Type.String({ minLength: 1 }),
  params: Type.Optional(scalarMap),
})

const definitions: ToolDefinition[] = [
  forwardTool({
    name: 'agent.capabilities',
    version,
    title: 'List Agent capabilities',
    description: 'List the current canonical tool capabilities and their availability reasons.',
    inputSchema: strictObject({}),
    outputSchema: strictObject({
      registryVersion: Type.String(),
      tools: Type.Array(
        strictObject({
          name: Type.String(),
          version: Type.String(),
          available: Type.Boolean(),
          reasonCode: Type.Optional(Type.String()),
          reason: Type.Optional(Type.String()),
        }),
      ),
    }),
    audiences: audienceAll,
    policy: readPolicy(),
  }),
  forwardTool({
    name: 'chart.getContext',
    version,
    title: 'Get chart context',
    description:
      'Read the minimum serializable chart context and its current revision identifiers.',
    inputSchema: strictObject({}),
    outputSchema: strictObject({
      chartId: Type.Optional(Type.String()),
      symbol: Type.Optional(Type.String()),
      market: Type.Optional(Type.String()),
      exchange: Type.Optional(Type.String()),
      period: Type.Optional(Type.String()),
      theme: Type.Optional(Type.Enum(['light', 'dark'])),
      visibleRange: Type.Optional(contextRange),
      chartRevision: Type.Number({ minimum: 0 }),
      dataRevision: Type.Number({ minimum: 0 }),
    }),
    audiences: audienceAll,
    policy: readPolicy(),
  }),
  forwardTool({
    name: 'chart.getState',
    version,
    title: 'Get chart state',
    description:
      'Read a bounded chart state summary suitable for deterministic postcondition checks.',
    inputSchema: strictObject({}),
    outputSchema: strictObject({
      chartRevision: Type.Number({ minimum: 0 }),
      dataRevision: Type.Number({ minimum: 0 }),
      theme: Type.Optional(Type.Enum(['light', 'dark'])),
      visibleRange: Type.Optional(contextRange),
      activeIndicators: Type.Array(indicatorInstance),
      comparisonSymbols: Type.Array(Type.String()),
      drawingIds: Type.Array(Type.String()),
      markerIds: Type.Array(Type.String()),
    }),
    audiences: audienceAll,
    policy: readPolicy(),
  }),
  defineTool({
    name: 'chart.scrollToRight',
    version,
    title: 'Scroll to latest',
    description:
      'Scroll the chart to the rightmost position so the latest available bars are visible.',
    inputSchema: strictObject({}),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'chart.setTheme',
    version,
    title: 'Set chart theme',
    description: 'Switch the chart between its supported light and dark visual themes.',
    inputSchema: strictObject({ theme: Type.Enum(['light', 'dark']) }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'chart.zoomIn',
    version,
    title: 'Zoom chart in',
    description: 'Zoom the chart in by one discrete level around an optional horizontal anchor.',
    inputSchema: strictObject({ anchorX: Type.Optional(Type.Number()) }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'chart.zoomOut',
    version,
    title: 'Zoom chart out',
    description: 'Zoom the chart out by one discrete level around an optional horizontal anchor.',
    inputSchema: strictObject({ anchorX: Type.Optional(Type.Number()) }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'chart.zoomToLevel',
    version,
    title: 'Set chart zoom level',
    description:
      'Set the chart to an exact discrete zoom level around an optional horizontal anchor.',
    inputSchema: strictObject({
      level: Type.Integer({ minimum: 1, maximum: 20 }),
      anchorX: Type.Optional(Type.Number()),
    }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'data.addComparisonSymbol',
    version,
    title: 'Add comparison symbol',
    description:
      'Add a comparison or overlay instrument after its market identity has been resolved.',
    inputSchema: strictObject({
      symbol: Type.String({ minLength: 1 }),
      market: Type.Optional(Type.String({ minLength: 1 })),
      exchange: Type.Optional(Type.String({ minLength: 1 })),
      source: Type.Optional(Type.String({ minLength: 1 })),
    }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy({ confirmation: 'when-inferred' }),
  }),
  defineTool({
    name: 'data.appendData',
    version,
    title: 'Append raw chart data',
    description:
      'Append trusted raw OHLCV bars through the legacy SDK and MCP compatibility surface.',
    inputSchema: strictObject({
      bars: Type.Array(
        strictObject({
          timestamp: Type.Optional(Type.Number()),
          open: Type.Number(),
          high: Type.Number(),
          low: Type.Number(),
          close: Type.Number(),
          volume: Type.Number({ minimum: 0 }),
        }),
        { minItems: 1, maxItems: 10_000 },
      ),
    }),
    outputSchema: emptyOutput,
    audiences: audienceTrusted,
    requiresLegacyRawMutations: true,
    policy: writePolicy({
      safety: 'destructive',
      confirmation: 'always',
      reversible: false,
    }),
  }),
  defineTool({
    name: 'data.removeComparisonSymbol',
    version,
    title: 'Remove comparison symbol',
    description: 'Remove an existing comparison or overlay instrument from the active chart.',
    inputSchema: strictObject({ symbol: Type.String({ minLength: 1 }) }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'data.setSymbols',
    version,
    title: 'Set primary instrument',
    description:
      'Set the primary instrument and optional period without assuming an ambiguous market.',
    inputSchema: strictObject({
      symbol: Type.String({ minLength: 1 }),
      market: Type.Optional(Type.String({ minLength: 1 })),
      exchange: Type.Optional(Type.String({ minLength: 1 })),
      period: Type.Optional(Type.String({ minLength: 1 })),
      adjust: Type.Optional(Type.Enum(['qfq', 'hfq', 'none'])),
      source: Type.Optional(Type.String({ minLength: 1 })),
      startDate: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
      endDate: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy({ confirmation: 'when-inferred' }),
  }),
  defineTool({
    name: 'data.updateData',
    version,
    title: 'Update raw chart data',
    description:
      'Update trusted raw OHLCV bars through the legacy SDK and MCP compatibility surface.',
    inputSchema: strictObject({
      bars: Type.Array(
        strictObject({
          timestamp: Type.Optional(Type.Number()),
          open: Type.Number(),
          high: Type.Number(),
          low: Type.Number(),
          close: Type.Number(),
          volume: Type.Number({ minimum: 0 }),
        }),
        { minItems: 1, maxItems: 10_000 },
      ),
    }),
    outputSchema: emptyOutput,
    audiences: audienceTrusted,
    requiresLegacyRawMutations: true,
    policy: writePolicy({
      safety: 'destructive',
      confirmation: 'always',
      reversible: false,
    }),
  }),
  defineTool({
    name: 'drawing.add',
    version,
    title: 'Add chart drawing',
    description: 'Add a drawing with validated anchors and bounded visual style overrides.',
    inputSchema: strictObject({
      kind: Type.Enum([
        'trend-line',
        'ray',
        'extended-line',
        'horizontal-line',
        'horizontal-ray',
        'vertical-line',
        'cross-line',
        'info-line',
        'parallel-channel',
        'regression-channel',
        'flat-line',
        'disjoint-channel',
      ]),
      anchors: Type.Array(strictObject({ barIndex: Type.Number(), price: Type.Number() }), {
        minItems: 1,
        maxItems: 3,
      }),
      style: Type.Optional(
        strictObject({
          stroke: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
          strokeWidth: Type.Optional(Type.Number({ minimum: 0.25, maximum: 20 })),
          strokeStyle: Type.Optional(Type.Enum(['solid', 'dashed', 'dotted'])),
        }),
      ),
    }),
    outputSchema: strictObject({ drawingId: Type.String({ minLength: 1 }) }),
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'drawing.clear',
    version,
    title: 'Clear chart drawings',
    description:
      'Remove every drawing from the active chart after explicit structured confirmation.',
    inputSchema: strictObject({}),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy({ safety: 'destructive', confirmation: 'always' }),
  }),
  defineTool({
    name: 'drawing.remove',
    version,
    title: 'Remove chart drawing',
    description: 'Remove one existing chart drawing by its stable drawing object identifier.',
    inputSchema: strictObject({ drawingId: Type.String({ minLength: 1 }) }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'drawing.setTool',
    version,
    title: 'Set drawing cursor tool',
    description: 'Activate one supported drawing cursor tool or return the chart to cursor mode.',
    inputSchema: strictObject({
      tool: Type.Union([
        Type.Enum(['trend-line', 'h-line', 'fib-retracement', 'rectangle', 'arrow']),
        Type.Null(),
      ]),
    }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'indicators.add',
    version,
    title: 'Add chart indicator',
    description: 'Add a registered technical indicator definition to the active chart.',
    inputSchema: strictObject({ definitionId: Type.String({ minLength: 1 }) }),
    outputSchema: strictObject({
      instanceId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    }),
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  forwardTool({
    name: 'indicators.listActive',
    version,
    title: 'List active indicators',
    description:
      'List active indicator instances with their definitions and validated parameter values.',
    inputSchema: strictObject({}),
    outputSchema: strictObject({ indicators: Type.Array(indicatorInstance) }),
    audiences: audienceAll,
    policy: readPolicy(),
  }),
  forwardTool({
    name: 'indicators.query',
    version,
    title: 'Query indicator evidence',
    description:
      'Query compact semantic indicator evidence through the stable asynchronous core facade.',
    inputSchema: strictObject({
      definitionId: Type.String({ minLength: 1 }),
      params: Type.Optional(numberMap),
      from: Type.Optional(Type.Number()),
      to: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 2_000 })),
    }),
    outputSchema: strictObject({ content: Type.String({ minLength: 1 }) }),
    audiences: audienceAll,
    policy: readPolicy(30_000),
  }),
  defineTool({
    name: 'indicators.remove',
    version,
    title: 'Remove chart indicator',
    description: 'Remove one active indicator instance by its stable instance identifier.',
    inputSchema: strictObject({ instanceId: Type.String({ minLength: 1 }) }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'indicators.updateParams',
    version,
    title: 'Update indicator parameters',
    description: 'Update the validated scalar parameters of one active indicator instance.',
    inputSchema: strictObject({
      instanceId: Type.String({ minLength: 1 }),
      params: scalarMap,
    }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  defineTool({
    name: 'markers.clear',
    version,
    title: 'Clear chart markers',
    description: 'Remove custom chart markers within the currently authorized marker scope.',
    inputSchema: strictObject({}),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy({ confirmation: 'when-inferred' }),
  }),
  defineTool({
    name: 'markers.update',
    version,
    title: 'Update chart markers',
    description: 'Replace authorized custom markers with a strictly validated bounded marker list.',
    inputSchema: strictObject({
      markers: Type.Array(
        strictObject({
          id: Type.String({ minLength: 1 }),
          date: Type.String({ minLength: 1, maxLength: 40 }),
          shape: Type.Enum(['arrow_up', 'arrow_down', 'flag', 'circle', 'rectangle', 'diamond']),
          groupKey: Type.Optional(Type.String({ minLength: 1 })),
          style: Type.Optional(markerStyle),
          label: Type.Optional(
            strictObject({
              text: Type.String({ minLength: 1, maxLength: 500 }),
              position: Type.Optional(Type.Enum(['left', 'right', 'top', 'bottom', 'inside'])),
            }),
          ),
        }),
        { maxItems: 2_000 },
      ),
    }),
    outputSchema: emptyOutput,
    audiences: audienceAll,
    policy: writePolicy(),
  }),
  forwardTool({
    name: 'navigation.setVisibleRange',
    version,
    title: 'Set exact visible range',
    description:
      'Set an exact requested time range and later verify the resulting visible chart range.',
    inputSchema: strictObject({ from: Type.Number(), to: Type.Number() }),
    outputSchema: strictObject({ visibleRange: contextRange }),
    audiences: audienceAll,
    policy: writePolicy({ syncCompatible: false }),
  }),
  defineTool({
    name: 'settings.update',
    version,
    title: 'Update arbitrary chart settings',
    description:
      'Update arbitrary legacy chart settings only through an explicitly trusted compatibility client.',
    inputSchema: strictObject({
      settings: Type.Optional(legacySettingsMap),
      options: Type.Optional(legacySettingsMap),
    }),
    outputSchema: emptyOutput,
    audiences: audienceTrusted,
    requiresLegacyRawMutations: true,
    policy: writePolicy({ confirmation: 'always' }),
  }),
]

for (const [name, title, description, inputSchema] of [
  [
    'alerts.addIndicatorCross',
    'Add indicator crossing alert',
    'Create a persistent indicator crossing alert after the alert state machine is implemented.',
    strictObject({
      id: Type.String({ minLength: 1 }),
      name: Type.String({ minLength: 1 }),
      indicatorId: Type.String({ minLength: 1 }),
      threshold: Type.Number(),
      direction: Type.Enum(['up', 'down', 'any']),
      oneShot: Type.Boolean(),
    }),
  ],
  [
    'alerts.addPriceCross',
    'Add price crossing alert',
    'Create a persistent price crossing alert after the alert state machine is implemented.',
    strictObject({
      id: Type.String({ minLength: 1 }),
      name: Type.String({ minLength: 1 }),
      price: Type.Number(),
      direction: Type.Enum(['up', 'down', 'any']),
      oneShot: Type.Boolean(),
    }),
  ],
  [
    'alerts.remove',
    'Remove alert',
    'Remove a persistent alert after the alert lifecycle and background trigger model are implemented.',
    strictObject({ id: Type.String({ minLength: 1 }) }),
  ],
  [
    'replay.pause',
    'Pause replay',
    'Pause chart replay after the replay state machine and deterministic time control are implemented.',
    strictObject({}),
  ],
  [
    'replay.play',
    'Start replay',
    'Start chart replay after the replay state machine and deterministic time control are implemented.',
    strictObject({}),
  ],
  [
    'replay.seekTo',
    'Seek replay cursor',
    'Move the replay cursor after the replay state machine and deterministic time control are implemented.',
    strictObject({ position: Type.Number() }),
  ],
  [
    'replay.setSpeed',
    'Set replay speed',
    'Set chart replay speed after the replay state machine and deterministic time control are implemented.',
    strictObject({ speed: Type.Number({ minimum: 0.01, maximum: 1_000 }) }),
  ],
] as const) {
  definitions.push(
    forwardTool({
      name,
      version,
      title,
      description,
      inputSchema,
      outputSchema: emptyOutput,
      audiences: audienceAll,
      policy: writePolicy({ syncCompatible: false }),
    }),
  )
}

export const CANONICAL_TOOL_REGISTRY = createToolRegistry(TOOL_REGISTRY_VERSION, definitions)
