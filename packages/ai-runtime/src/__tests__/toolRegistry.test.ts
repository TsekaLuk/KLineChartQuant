import { Type, type TSchema } from 'typebox'
import { describe, expect, it } from 'vitest'

import {
  CANONICAL_TOOL_REGISTRY,
  TOOL_REGISTRY_VERSION,
  createToolRegistry,
  defineTool,
  serializeToolRegistry,
} from '../toolRegistry'

const strict = { additionalProperties: false } as const

function findOpenObjects(schema: TSchema, path = '$'): string[] {
  const openObjects: string[] = []
  if (schema.type === 'object') {
    const dynamicDomainMap = schema.patternProperties !== undefined
    if (!dynamicDomainMap && schema.additionalProperties !== false) openObjects.push(path)
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      openObjects.push(...findOpenObjects(property as TSchema, `${path}.${name}`))
    }
  }
  if (schema.type === 'array' && schema.items) {
    openObjects.push(...findOpenObjects(schema.items as TSchema, `${path}[]`))
  }
  const branches = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  branches.forEach((branch, index) => {
    openObjects.push(...findOpenObjects(branch as TSchema, `${path}|${index}`))
  })
  return openObjects
}

describe('canonical tool registry', () => {
  it('owns unique, versioned contracts with complete execution metadata', () => {
    expect(TOOL_REGISTRY_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    const tools = CANONICAL_TOOL_REGISTRY.list()
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length)
    expect(Object.isFrozen(tools)).toBe(true)

    for (const tool of tools) {
      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(tool.title.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThanOrEqual(30)
      expect(tool.policy.timeoutMs).toBeGreaterThan(0)
      expect(['parallel', 'sequential']).toContain(tool.policy.execution)
      expect(['never', 'when-inferred', 'always']).toContain(tool.policy.confirmation)
      expect(typeof tool.policy.reversible).toBe('boolean')
      expect(typeof tool.policy.syncCompatible).toBe('boolean')
      expect(Object.isFrozen(tool)).toBe(true)
      expect(Object.isFrozen(tool.inputSchema)).toBe(true)
      expect(Object.isFrozen(tool.inputSchema.properties ?? {})).toBe(true)
      expect(Object.isFrozen(tool.outputSchema)).toBe(true)
      expect(findOpenObjects(tool.inputSchema)).toEqual([])
      expect(findOpenObjects(tool.outputSchema)).toEqual([])
    }
  })

  it('strictly validates inputs without coercion', () => {
    const cases = [
      [{ level: '14' }, 'type'],
      [{ level: 1.5 }, 'type'],
      [{ level: 0 }, 'minimum'],
      [{ level: 2, surprise: true }, 'additionalProperties'],
      [{}, 'required'],
    ] as const

    for (const [input, keyword] of cases) {
      const result = CANONICAL_TOOL_REGISTRY.validateInput('chart.zoomToLevel', input)
      expect(result.ok).toBe(false)
      const issueKeywords = result.ok ? [] : result.issues.map((issue) => issue.keyword)
      expect(issueKeywords).toContain(keyword)
    }

    expect(CANONICAL_TOOL_REGISTRY.validateInput('chart.zoomToLevel', { level: 14 })).toEqual({
      ok: true,
      value: { level: 14 },
    })

    const nested = CANONICAL_TOOL_REGISTRY.validateInput('markers.update', {
      markers: [
        {
          id: 'marker-1',
          date: '2026-08-24',
          shape: 'circle',
          style: { opacity: 0.5, nested: { unsafe: true } },
        },
      ],
    })
    expect(nested).toMatchObject({
      ok: false,
      issues: [{ path: '/markers/0/style', keyword: 'additionalProperties' }],
    })
  })

  it('validates successful output against the same contract source', () => {
    expect(
      CANONICAL_TOOL_REGISTRY.validateOutput('indicators.add', { instanceId: 'rsi-1' }),
    ).toMatchObject({ ok: true })
    expect(
      CANONICAL_TOOL_REGISTRY.validateOutput('indicators.add', { indicatorId: 'rsi-1' }),
    ).toMatchObject({ ok: false })
  })

  it('re-probes capabilities for each projection and retains reason codes', () => {
    const supportedTools = new Set<string>(['chart.setTheme'])
    const first = CANONICAL_TOOL_REGISTRY.project({
      audience: 'first-party',
      supportedTools,
    })
    expect(first.available.map((tool) => tool.name)).toEqual(['chart.setTheme'])
    expect(first.unavailable.find((item) => item.name === 'chart.zoomIn')).toMatchObject({
      capability: { available: false, reasonCode: 'HOST_UNSUPPORTED' },
    })

    supportedTools.add('chart.zoomIn')
    const second = CANONICAL_TOOL_REGISTRY.project({
      audience: 'first-party',
      supportedTools,
    })
    expect(second.available.map((tool) => tool.name)).toEqual(['chart.setTheme', 'chart.zoomIn'])
  })

  it('hides raw mutators, arbitrary settings, and unavailable tools from first-party Pi', () => {
    const names = CANONICAL_TOOL_REGISTRY.project({ audience: 'first-party' }).available.map(
      (tool) => tool.name,
    )
    expect(names).not.toContain('data.appendData')
    expect(names).not.toContain('data.updateData')
    expect(names).not.toContain('settings.update')
    expect(names.some((name) => name.startsWith('alerts.'))).toBe(false)
    expect(names.some((name) => name.startsWith('replay.'))).toBe(false)
    expect(names).toContain('indicators.query')
    expect(names).toContain('navigation.setVisibleRange')
    expect(names).toContain('chart.getState')
  })

  it('requires an explicit trusted capability for legacy MCP raw mutations', () => {
    const defaultNames = CANONICAL_TOOL_REGISTRY.project({ audience: 'mcp' }).available.map(
      (tool) => tool.name,
    )
    expect(defaultNames).not.toContain('data.appendData')
    expect(defaultNames).not.toContain('settings.update')

    const trustedNames = CANONICAL_TOOL_REGISTRY.project({
      audience: 'mcp',
      allowLegacyRawMutations: true,
    }).available.map((tool) => tool.name)
    expect(trustedNames).toContain('data.appendData')
    expect(trustedNames).toContain('settings.update')
  })

  it('rejects duplicate contracts at registry construction', () => {
    const fixture = defineTool({
      name: 'fixture.echo',
      version: '1.0.0',
      title: 'Echo',
      description: 'Echo a strictly validated fixture value for contract testing.',
      inputSchema: Type.Object({ value: Type.String() }, strict),
      outputSchema: Type.Object({ value: Type.String() }, strict),
      audiences: ['first-party', 'mcp'],
      policy: {
        safety: 'read-only',
        confirmation: 'never',
        reversible: false,
        execution: 'parallel',
        timeoutMs: 1_000,
        syncCompatible: false,
      },
    })
    expect(() => createToolRegistry('1.0.0', [fixture, fixture])).toThrow(/duplicate/i)
  })

  it('serializes a deterministic contract snapshot without functions', () => {
    const snapshot = serializeToolRegistry(CANONICAL_TOOL_REGISTRY)
    expect(snapshot.registryVersion).toBe(TOOL_REGISTRY_VERSION)
    const names = snapshot.tools.map((tool) => tool.name)
    expect(
      names.every((name, index) => index === 0 || names[index - 1]!.localeCompare(name) <= 0),
    ).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain('capability')
    expect(snapshot.tools.find((tool) => tool.name === 'chart.setTheme')).toMatchObject({
      version: '1.0.0',
      policy: { safety: 'reversible-write', confirmation: 'never' },
      inputSchema: { additionalProperties: false },
    })
    expect(JSON.parse(JSON.stringify(snapshot))).toMatchSnapshot()
  })
})
