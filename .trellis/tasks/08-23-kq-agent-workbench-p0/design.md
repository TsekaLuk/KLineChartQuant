# KQ Agent Workbench P0 - Technical Design

## Baseline And Migration

Implementation starts by integrating `upstream/main` because that is the
v0.10.x monorepo baseline audited by the source PRD. The fork's two local commits
must remain present. The merge is verified before any Agent changes with root
typecheck, package tests, and builds; failures attributable to the baseline are
recorded separately from Agent regressions.

No Agent feature is implemented against the old root-level v0.7 package tree.

## Architecture Boundaries

```text
Electron Renderer
  Vue workspace + stable Agent bridge client
  KLineChart + ChartController.agent
  RendererToolProxy target + postcondition state
             |
             | versioned method IPC + MessagePort events
             v
Electron Main
  AgentApplicationService + Pi loop
  provider/credential/session/trace services
  policy, cancellation, timeout, retry, redaction
             |
             +--> 302.ai OpenAI-compatible API

Canonical Tool Registry
  +--> in-process Pi adapter
  +--> external MCP adapter
```

Core owns chart truth and compact indicator computation. `ai-runtime` owns the
provider-neutral chart tool contract and external MCP adapter. The new
`agent-runtime` owns the framework-neutral Pi loop, sessions, provider adapters,
traces, and faux/live evaluation. `desktop-electron` owns Electron lifecycle,
credential encryption, IPC routing, Renderer target routing, and Vue UX.

## Stable Contracts

### Core Agent Facade

`ChartController.agent` exposes only serializable `getContext()` and
`queryIndicator()`. The public `./agent` export contains bounded input/context
types and stable errors. Query output remains compact text; adapters add context,
revision, duration, and request metadata without parsing that text.

### Canonical Tool Registry

Each definition owns a stable name/version, TypeBox-compatible input and output
schema, policy, capability probe, async execution, optional postcondition, and a
typed result envelope. Both adapters are mechanical views over these definitions.
Runtime validation rejects unknown fields and type coercion.

The old `executeTool()` delegates only to sync-compatible definitions so current
MCP consumers are not broken during Alpha migration.

### IPC And Streaming

The preload exports method-level functions only. Commands carry protocol,
window/chart/session/run/request IDs, deadline, and payload schema version.
Main verifies sender and ownership. Commands use invoke/handle; high-frequency
events use a MessagePort and are batched by Renderer before Vue updates.

### Persistence And Credentials

Sessions, message trees, runs, tools, confirmations, usage, and undo groups use a
versioned transactional SQLite store in `agent-runtime`. Electron safeStorage
encrypts provider secrets separately. Linux weak-storage detection disables
persistence by default. Renderer receives only configured state and a masked
fingerprint.

## Execution Semantics

At run creation, Main freezes chart/data revisions and injects only the minimum
chart context. Tool execution proceeds through validation, capability, policy,
confirmation, target validation, execution, output validation, postcondition,
trace, and persistence.

Read tools may run in parallel. Renderer mutations are sequential and carry the
expected revision. The idempotency store returns the first result for repeated
delivery. Successful reversible mutations create undo tokens and a turn group.
Partial cancellation remains visible and undoable.

Provider and tool errors map to stable codes with `retryable` and optional
`retryAfterMs`. State conflicts permit one reread/replan attempt. Tool loops stop
at 8 by default and never exceed 12.

## Security Model

Renderer is untrusted. Electron uses context isolation, sandboxing, no Node
integration, strict CSP, sender validation, restricted navigation/window open,
safe external URL parsing, and narrow preload methods. No file, environment,
shell, raw data mutation, alert, replay, or arbitrary settings capability is
given to the model. Tool/data text is untrusted and cannot affect policy.

Redaction runs before every logging, persistence, export, exception, snapshot,
and report boundary. The live workflow reads secrets only from CI secret storage.

## Child Boundaries And Order

Workspace UI and Core facade are independent after baseline integration. The
Pi runtime consumes both contracts. Canonical registry follows the stable
runtime and Core contracts. Chart-tool integration consumes registry + IPC.
302.ai consumes the stable runtime/provider interface. Hardening owns final
cross-layer tests and release gates.

```text
baseline -> workspace UI ----+
         -> core facade ------+-> Pi runtime -> registry -> chart tools
                                                   |             |
                                                   +-> 302.ai ---+-> hardening
```

## Compatibility And Rollback

- Preserve MCP v1 tool names and legacy synchronous behavior where declared.
- Use optional additions or tool-version increments for contract changes.
- Keep schema snapshots and migration fixtures as rollback evidence.
- Each child must leave its package buildable and independently revertible.
- The upstream baseline merge is a distinct checkpoint before feature edits.
- Live-provider failures never relax deterministic or security gates.
