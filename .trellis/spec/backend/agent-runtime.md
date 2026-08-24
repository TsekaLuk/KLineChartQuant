# Native Agent Runtime

## 1. Scope / Trigger

Use this contract when changing `packages/ai-runtime`, `packages/agent-runtime`,
composing them in an Electron Main process, extending Agent IPC, or packaging
Pi session support.
Vue and Electron Renderer code consume only normalized contracts; Provider,
Pi, SQLite, credential, and Electron object lifetimes remain behind Main-owned
adapters.

## 2. Signatures

```ts
interface RuntimeSupport {
  provider: {
    getStatus(): ProviderStatusView | Promise<ProviderStatusView>
    listModels(input: ProviderModelsInput): Promise<ProviderModelsResult>
    test(input: ProviderTestInput): Promise<ProviderTestResult>
    deleteCredential(): Promise<void>
  }
  createPlan(context: RunPersistenceContext): PiRunPlan | Promise<PiRunPlan>
}

interface AgentIpcEnvelope {
  protocolVersion: 2
  payloadVersion: 2
  windowId: string
  chartId: string
  requestId: string
  deadlineAt: number
  command: AgentIpcCommand
  payload: unknown
}

interface ToolDefinition<I, O> {
  name: string
  version: string
  inputSchema: TSchema
  outputSchema: TSchema
  policy: {
    safety: 'read-only' | 'reversible-write' | 'destructive' | 'external-side-effect'
    confirmation: 'never' | 'when-inferred' | 'always'
    reversible: boolean
    execution: 'parallel' | 'sequential'
    timeoutMs: number
    syncCompatible: boolean
  }
  capability(context: ToolCapabilityContext): ToolCapability
}

executeToolAsync(
  call: CanonicalToolCall,
  identity: ToolExecutionIdentity,
  options: ExecuteToolOptions,
): Promise<CanonicalToolResult>
```

Stable package entries are `.`, `./contracts`, `./contracts/ui`, `./node`, and
`./testing`. The root entry must remain browser-safe. SQLite composition is
imported from `./node`; deterministic Faux support is imported from `./testing`
only in an `e2e` build.
The browser-safe `ai-runtime/browser` entry owns canonical contracts used by
the in-process Pi adapter. Node MCP composition remains in the `ai-runtime`
root and `./mcp-server` entry.

## 3. Contracts

- `AgentApplicationService` is the only writer of run state transitions and
  assigns a process-wide monotonic `sequence` to replayable UI events.
- Session snapshots carry `lastSequence`. Renderer subscribes before loading a
  snapshot, buffers live events, installs the snapshot, then applies only events
  whose sequence is newer.
- Production Electron uses Pi SQLite sessions under `app.getPath('userData')`.
  Startup converts runs without a terminal record to `interrupted`.
- Main validates schema, deadline, payload size, main-frame sender, window/chart
  target, request deduplication, and session/run ownership before dispatch.
- ContextBridge exposes method-level `AgentBridgeClient` functions. Raw
  `ipcRenderer`, channel names, MessagePorts, Pi payloads, and Electron events
  never cross into Renderer code.
- Credentials and secret values are Main-only and pass through central
  redaction before events, persistence, logs, and structured errors.
- The 302.ai credential is accepted only by `provider.models` and
  `provider.test` request inputs. Renderer receives bounded model/status/test
  views and must never receive or persist the key. A configuration becomes
  runnable only after catalog, text, and exact harmless tool-call probes pass.
- Live evaluation reads only `KQ_302AI_API_KEY`; a missing variable is a
  zero-request skip. Quality evidence is exact-ID evidence: the official model
  catalog marks `gpt-5.6-luna` as a current candidate, while the observed Arena
  rank 63 belongs only to the exact `gpt-5.6-luna-xhigh` row. Never copy a
  variant's Arena rank onto the base model or infer 302.ai availability from
  either source.
- Production packages exclude runtime source, coverage, tests, and
  `dist/testing`. Electron Main bundles Agent runtime, Pi AI/Core, and the
  SQLite backend; `node:sqlite` remains a system import. Because the bundled
  backend resolves its migration at runtime, the build must explicitly emit
  Pi's `001_initial.sql` as `out/main/migrations/001_initial.sql` and preserve
  it in `app.asar`.
- A missing production Provider fails closed with `PROVIDER_NOT_CONFIGURED`; it
  must never return scripted or Faux text. Production builds must not contain a
  Faux import or testing chunk. `electron-vite build --mode e2e` is the only
  desktop build that may emit the separate testing chunk.
- `CANONICAL_TOOL_REGISTRY` is the only tool-schema and policy source. Compile
  TypeBox input/output validators once, close object schemas, and never coerce
  values. Every Pi run/turn and MCP `tools/list` performs a fresh capability
  projection.
- Freeze every registry entry and its nested schemas before compiling validators;
  otherwise a caller can mutate the published schema while execution still uses
  the stale compiled contract. Pi and MCP adapters own their audience values and
  must overwrite, not trust, audience data supplied in a capability context.
- First-party Pi calls `executeToolAsync` in process through `createPiTools`;
  it never opens an MCP/WebSocket/stdio loopback. MCP uses
  `createMcpToolAdapter` over the same executor.
- `ALL_TOOLS`, `TOOL_GROUPS`, `findTool`, and synchronous `executeTool` are
  compatibility views only. Never send `ALL_TOOLS` to a model. The sync path
  accepts only definitions marked `syncCompatible`.
- First-party projections exclude raw `data.appendData` / `data.updateData`,
  arbitrary `settings.update`, and unavailable alert/replay contracts. Trusted
  MCP raw mutation requires an explicit capability. MCP chart tools require
  exactly one ready chart session and never select the first of several.
- Canonical execution order is lookup -> capability -> input validation ->
  policy/confirmation -> timeout/AbortSignal -> host -> output validation ->
  postcondition. After installing a caller abort listener, re-check
  `signal.aborted` before invoking the host so cancellation cannot race listener
  registration. Every exit carries stable identity/version/duration metadata.

## 4. Validation & Error Matrix

| Condition                                  | Stable result                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Protocol or payload version mismatch       | `INVALID_PROTOCOL` / `INVALID_PAYLOAD`                                         |
| Expired deadline or oversized payload      | `DEADLINE_EXCEEDED` / `PAYLOAD_TOO_LARGE`                                      |
| Non-main frame or wrong window/chart owner | `TARGET_MISMATCH`                                                              |
| Reused request ID with different input     | `DUPLICATE_REQUEST`                                                            |
| Missing Provider adapter or credential     | `PROVIDER_NOT_CONFIGURED`                                                      |
| Provider 401 / 403 / 404                    | `PROVIDER_AUTHENTICATION` / `PROVIDER_PERMISSION` / `PROVIDER_MODEL_NOT_FOUND` |
| Provider 429 / 5xx / timeout                | `PROVIDER_RATE_LIMITED` / `PROVIDER_UNAVAILABLE` / `PROVIDER_TIMEOUT`          |
| Malformed output / invalid tool call        | `PROVIDER_MALFORMED_RESPONSE` / `PROVIDER_INCOMPATIBLE_TOOLS`                  |
| Tool/provider deadline or explicit stop    | `TIMEOUT` / terminal cancelled or partial run                                  |
| More than the configured tool-turn limit   | `TOOL_LOOP_LIMIT`                                                              |
| Unknown or unavailable canonical tool      | `UNKNOWN_TOOL` / `TOOL_UNAVAILABLE`                                            |
| Invalid canonical input                    | `INVALID_ARGUMENTS` / `UNKNOWN_FIELD` / `OUT_OF_RANGE`                         |
| Invalid successful tool output             | `INVALID_TOOL_OUTPUT`                                                          |
| Policy or confirmation refusal             | `POLICY_DENIED` / `CONFIRMATION_REQUIRED`                                      |
| Tool deadline or caller abort              | `TIMEOUT` / `CANCELLED`                                                        |
| Host or verifier throws                    | redacted `TOOL_EXECUTION_FAILED` / `POSTCONDITION_FAILED`                      |
| Unknown future session schema              | `SESSION_SCHEMA_UNSUPPORTED`                                                   |
| Open run found during startup recovery     | persisted `interrupted` run                                                    |

Consumers branch on `code`, never message text. Unknown errors are normalized
once at the adapter boundary and returned without raw Provider details.

## 5. Good / Base / Bad Cases

- Good: Main imports runtime APIs from `.`, SQLite from `./node`, and dynamically
  imports `./testing` only in a compile-time `e2e` branch.
- Base: no Provider is configured; sessions still open and persist, while test
  and run commands return `PROVIDER_NOT_CONFIGURED`.
- Bad: Renderer reads an environment key, imports Pi, opens SQLite, listens on a
  raw IPC channel, or production falls back to a scripted response.
- Good: a turn calls `createPiTools` with current host capabilities and invokes
  a canonical handler directly; MCP parity tests return the same domain
  result/error without an MCP server running.
- Base: a declared query/range tool has no host implementation; its capability
  reason remains available to diagnostics, but the tool is absent from model
  and MCP catalogs.
- Bad: application code publishes `ALL_TOOLS`, hand-authors a second Pi/MCP
  schema, silently defaults an ambiguous instrument to CN, or parses error
  message strings to decide retry behavior.

## 6. Tests Required

- Runtime unit/integration: ordered streaming, tool lifecycle, abort signal,
  timeout, retry branch IDs, loop limit, migration, restart recovery, replay,
  and redaction.
- IPC contract: forged sender, strict schema, non-JSON input, deadline, size,
  dedupe conflict, ownership, structured preload error, and port cleanup.
- Electron E2E: native bridge streaming/cancel, SQLite reopen, shared reducer,
  chart canvas pixels, and compact/desktop layout.
- Packaging: unsigned unpack build; assert runtime `dist` and Pi migration exist;
  assert runtime source/tests/coverage/`dist/testing`, Faux imports, and secret
  sentinels are absent.
- Provider evaluation: deterministic Pareto tests keep exact-ID Arena evidence
  separate from current model candidates; the opt-in live runner either emits
  a redacted availability/compatibility/latency report or proves a missing-key
  zero-request skip.
- Node matrix: a suite skipped for unsupported Node versions must use a
  type-only top-level import and dynamically import `./node` inside the gated
  test. `describe.skip` runs after static module evaluation and cannot protect
  Node 22.12 from an unavailable `node:sqlite` import.
- Clean checkout: host Vitest configs resolve workspace runtime imports to the
  runtime source, or explicitly build the dependency first. Unit tests must not
  pass only because a developer has a stale `packages/agent-runtime/dist`.
- Package: strict TypeScript, `publint --strict`, direct `.` / `./node` Node ESM
  imports, and declaration scans for Vue/Electron/Core internal types.
- Canonical registry: compiled input/output failures, no coercion, closed
  objects, deeply frozen schemas, capability changes between turns, hidden
  raw/unavailable tools, timeout/cancel, redacted thrown errors, and a committed
  schema snapshot.
- Adapter contract: identical Pi/MCP validation, policy, domain result, and
  error codes; Pi succeeds without MCP transport; MCP catalog changes when its
  unique chart session appears or disappears; a pre-aborted signal never invokes
  the host; each adapter forces its own audience even if a stale context carries
  another audience.

## 7. Wrong vs Correct

### Wrong

```ts
import { createFauxRuntimeSupport } from '@363045841yyt/klinechart-agent-runtime/testing'

const support = createFauxRuntimeSupport()
```

This statically places the scripted Provider on the production path.

### Correct

```ts
const support: RuntimeSupport =
  import.meta.env.MODE === 'e2e'
    ? (await import('@363045841yyt/klinechart-agent-runtime/testing')).createFauxRuntimeSupport()
    : createUnavailableRuntimeSupport()
```

Vite removes the test branch from a production Main bundle. The later real
Provider adapter replaces `createUnavailableRuntimeSupport`, not the E2E path.

### Wrong: model catalog bypasses capability projection

```ts
const plan = { tools: ALL_TOOLS }
```

This leaks unavailable or trusted-only contracts and bypasses compiled output
validation and policy metadata.

### Correct: adapters project and execute one canonical registry

```ts
const tools = createPiTools({
  capabilityContext: currentChartCapabilities,
  identity: { sessionId, runId, turnId },
  execute: rendererToolHost,
  policy: applicationToolPolicy,
})
```

Construct this list for each run/turn. External MCP uses
`createMcpToolAdapter` with the same host and policy, not a copied schema.

### Wrong: caller-owned adapter audience

```ts
createMcpToolAdapter({ capabilityContext: { audience: selectedAudience }, ...options })
```

This lets an MCP integration accidentally project first-party or SDK-only
contracts. `createMcpToolAdapter` accepts a context without `audience` and sets
`audience: 'mcp'` internally; `createPiTools` applies the same rule for
`audience: 'first-party'`.

Arena evidence follows the same exactness rule. Do not family-match ranks:

```typescript
// Wrong: invents a rank for the unranked base candidate.
rank('gpt-5.6-luna') ?? rank('gpt-5.6-luna-xhigh')

// Correct: current-candidate and exact Arena evidence remain separate.
currentCandidates = [{ modelId: 'gpt-5.6-luna', source: 'official-model-catalog' }]
arenaPriors = [{ modelId: 'gpt-5.6-luna-xhigh', overallRank: 63 }]
```
