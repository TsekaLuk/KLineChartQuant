# @klinechart-quant/ai-runtime

> AI Native runtime for `@klinechart-quant`. The differentiation layer [`docs/ROADMAP.md`](../../docs/ROADMAP.md) §10.3 calls for: MCP tool schemas, controller state `describe()`, chart state serialization. Stays narrow — no LLM provider lock-in.

```bash
pnpm add @klinechart-quant/ai-runtime @klinechart-quant/core
```

## What's in the box

| Module | Purpose |
| --- | --- |
| `toolSchemas` | Pre-generated MCP / function-calling tool schemas for every controller mutator |
| `describeControllers` | `describe<X>State(snapshot)` → LLM-readable summaries + structured facts |
| `serialization` | `serialize(chart)` / `deserialize(json)` — round-trip "AI templates" across sessions, no eval |

## Quick start — register tools with a Claude API call

```typescript
import { ALL_TOOLS, findTool, TOOL_GROUPS } from '@klinechart-quant/ai-runtime'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

// Register the navigation + indicator subset (omit alerts if you don't want
// the LLM creating them autonomously).
const tools = [...TOOL_GROUPS.navigation, ...TOOL_GROUPS.indicators]

const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
    })),
    messages: [{ role: 'user', content: 'Show me BTC with a 20-period EMA and zoom to fit the last 100 bars.' }],
})

for (const block of response.content) {
    if (block.type === 'tool_use') {
        const tool = findTool(block.name)
        if (!tool) continue
        // Dispatch block.input to your chart's command handler.
    }
}
```

## Describe a controller for the LLM

```typescript
import { describeVolumeProfileState, describeFootprintLatestBar } from '@klinechart-quant/ai-runtime'

const vpState = volumeProfile.state()  // your @klinechart-quant/core controller
const description = describeVolumeProfileState(vpState)

// description.summary is one paragraph the LLM reads for context:
// "Volume Profile shows the Point of Control at 67500.00 — the price level
//  with the highest traded volume. The Value Area runs from 66800.00 (VAL)
//  to 68200.00 (VAH), spanning 1400.00 and containing 70.0% of total volume."

// description.facts is the structured form the LLM can quote precisely:
// { poc: 67500, vah: 68200, val: 66800, vaSpan: 1400, vaPercent: 70, totalVolume: 1000 }
```

## Save + restore an AI-generated chart template

```typescript
import { serialize, deserialize } from '@klinechart-quant/ai-runtime'

// 1. Harvest snapshot from your chart controllers
const snapshot = serialize({
    label: 'BTC swing-trade setup',
    viewport: chart.viewport(),
    theme: chart.theme(),
    indicators: indicatorSelector.active().map((i) => ({
        definitionId: i.definitionId,
        params: i.params,
    })),
    alerts: alerts.rules().map((r) => ({
        id: r.id, name: r.name, predicate: r.predicate, oneShot: r.oneShot,
    })),
})

const json = JSON.stringify(snapshot)
// Save json to OPFS / IndexedDB / your backend …

// 2. Restore later (or on another device)
const restored = deserialize(json)
// Apply restored.controllers.* to your chart controllers.
```

## Why this is safe — no `eval`, no code generation

`SerializedChartState` is **data only**. The LLM generates JSON the runtime validates; the LLM never produces TypeScript that gets executed. The `custom` alert predicate kind (which carries a function) is explicitly rejected by the alerts module's serializer — saved templates only contain whitelisted predicate shapes.

This is the safe-by-construction generative UI form §10.3 calls for: the LLM composes from existing capabilities only.

## Provider adapters (separate packages)

This package is provider-agnostic. Adapters for specific LLM providers live downstream:

- `@klinechart-quant/ai-runtime-claude` (planned) — Claude API + MCP server adapter
- `@klinechart-quant/ai-runtime-openai` (planned) — OpenAI function-calling adapter

## License

MIT
