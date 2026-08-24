# @363045841yyt/klinechart-ai-runtime

MCP (Model Context Protocol) server and AI tool schemas for
[@363045841yyt/klinechart-core]({{root}}packages/core)
([npm](https://www.npmjs.com/package/@363045841yyt/klinechart-core))
/
[@363045841yyt/klinechart]({{root}}packages/vue)
([npm](https://www.npmjs.com/package/@363045841yyt/klinechart)).

Optional addon — install only if you need AI agent / MCP control of your charts.

Tool contracts come from one versioned `CANONICAL_TOOL_REGISTRY`. It owns
TypeBox input/output schemas, compiled strict validation, capability probes,
policy metadata, timeouts, structured errors, and adapter projections. Build a
fresh projection for each run or turn; do not send `ALL_TOOLS` directly to a
model.

Provides a WebSocket-bridged MCP server that enables AI agents (via MCP Inspector
or any MCP client) to control K-line chart operations — zoom, pan, add/remove
indicators, change theme, and more.

## Installation

```bash
pnpm add @363045841yyt/klinechart-ai-runtime
```

Requires `@363045841yyt/klinechart-core` as a peer dependency.

## Quick Start

### Start the MCP server

```ts
import { createMcpServer } from '@363045841yyt/klinechart-ai-runtime/mcp-server'

const { start, stop } = createMcpServer({
  ws: { port: 8080 },
})

await start()
```

### Integrate with KLineChart (Vue example)

```vue
<template>
  <div class="app-container">
    <KlineChart ref="chartRef" :mcp="mcpConfig" />
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import { KlineChart } from '@363045841yyt/klinechart'
  import { executeTool } from '@363045841yyt/klinechart-ai-runtime'

  const chartRef = ref<InstanceType<typeof KlineChart> | null>(null)

  const mcpConfig = {
    wsUrl: 'ws://localhost:8080',
    autoReconnect: true,
    onToolCall: (call) => {
      const ctrl = chartRef.value?.getController?.()
      if (!ctrl) return { success: false, error: 'Controller not ready' }
      return executeTool(ctrl, call)
    },
  }
</script>

<style>
  .app-container {
    height: 80vh;
  }
</style>
```

### Connect from MCP Inspector

```bash
cd packages/ai-runtime
pnpm inspect
```

Then call tools like `chart.zoomToLevel` with `{ "level": 5 }`.

## Exports

### Main entry (`@363045841yyt/klinechart-ai-runtime`)

| Export                       | Description                                   |
| ---------------------------- | --------------------------------------------- |
| `executeToolAsync`           | Canonical async validation/execution path     |
| `CANONICAL_TOOL_REGISTRY`    | Versioned contract and capability owner       |
| `createMcpToolAdapter`       | Capability-filtered MCP projection            |
| `executeTool`                | Deprecated sync-compatible chart dispatcher   |
| `ALL_TOOLS`                  | Deprecated registry view, not a model catalog |
| `TOOL_GROUPS`                | Grouped compatibility views                   |
| `findTool(name)`             | Deprecated compatibility lookup               |
| `describeVolumeProfileState` | Generate VP state summary                     |
| `describeAnchoredVwap`       | Generate anchored VWAP summary                |
| `describeFootprintLatestBar` | Generate footprint summary                    |
| `describeAlerts`             | Generate alerts summary                       |
| `serialize` / `deserialize`  | Chart state serialization                     |
| `SessionRegistry`            | WebSocket session manager                     |

### MCP Server (`@363045841yyt/klinechart-ai-runtime/mcp-server`)

| Export                     | Description                            |
| -------------------------- | -------------------------------------- |
| `createMcpServer(options)` | Create MCP + WebSocket server instance |

### Create with MCP (`@363045841yyt/klinechart-ai-runtime/create-with-mcp`)

Legacy helper — prefer `executeTool` + `mcp` prop pattern above.

## Architecture

```
┌─────────────────┐        WebSocket          ┌───────────────────┐
│   Browser       │◄─────────────────────────►│  MCP Server       │
│                 │   register / tool:call    │  (Node.js)        │
│  KLineChart     │   tool:result /           │                   │
│  └─ ChartBridge │   state:update            │ ┌─ SessionRegistry│
│       ↓         │                           │ └─ WsSessionHandle│
│  └─ onToolCall ─┼───────────────────────────┼──► executeTool    │
└─────────────────┘                           └────────┬──────────┘
                                                       │ stdio
                                                       ▼
                                               ┌────────────────────┐
                                               │  MCP Client        │
                                               │  (Inspector / AI)  │
                                               └────────────────────┘
```

First-party Pi execution imports the browser-safe canonical contract and calls
`executeToolAsync` in process. It does not connect back to this MCP server.
The MCP server is an external adapter over the same registry and refuses to
publish chart tools unless exactly one chart session is ready. Raw K-line
mutators and arbitrary settings require an explicit trusted MCP capability;
unimplemented alert and replay contracts are never published.

The legacy synchronous `executeTool` remains for compatible SDK integrations.
It performs the same strict input/output validation, rejects async-only tools,
and never supplies an implicit market for ambiguous instruments.

## Available Tools

| Tool                      | Description                        |
| ------------------------- | ---------------------------------- |
| `chart.zoomToLevel`       | Zoom to a specific level           |
| `chart.setTheme`          | Switch between light/dark theme    |
| `indicators.add`          | Add an indicator by definition ID  |
| `indicators.remove`       | Remove an indicator by instance ID |
| `indicators.updateParams` | Update indicator parameters        |

{{include:_license.md}}
