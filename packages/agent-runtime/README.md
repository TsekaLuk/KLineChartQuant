# KLineChart Agent Runtime

Framework-neutral Pi orchestration for KLineChartQuant. The package owns the
stable Agent UI/IPC contracts, run lifecycle, durable Pi sessions, event replay,
redaction, and deterministic test support.

```ts
import {
  AgentApplicationService,
  RuntimeSessionService,
} from '@363045841yyt/klinechart-agent-runtime'
import { createNodeRuntimeSessions } from '@363045841yyt/klinechart-agent-runtime/node'
```

Use the root or `./contracts/ui` entry from browser code. Import `./node` only
from a Node or Electron Main process because it loads `node:sqlite`. The
`./testing` entry supplies the official Pi faux-provider composition and never
contacts a network service.

Renderer code consumes `AgentBridgeClient` and `AgentUiEvent`; Pi events,
Provider payloads, credentials, Electron objects, and raw tool results remain
behind the runtime and host adapters.

`createPiTools` is the first-party adapter for the canonical registry exported
by `@363045841yyt/klinechart-ai-runtime/browser`. Call it when constructing each
run/turn so capabilities are probed again. It generates Pi parameters and
policy metadata from the registry and invokes `executeToolAsync` directly in
process; no local MCP, WebSocket, or stdio loopback is involved.

Canonical failures are thrown as `CanonicalPiToolError` with a structured,
retry-aware `result`. Raw data mutation, arbitrary settings, and unavailable
alert/replay contracts are absent from the generated first-party tool list.
