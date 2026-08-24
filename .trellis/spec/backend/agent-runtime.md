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

interface RendererToolTarget {
  windowId: string
  chartId: string
  hostGeneration: number
}

interface RendererToolTransport {
  target: RendererToolTarget
  request(message: RendererToolMessage, signal?: AbortSignal): Promise<unknown>
  close?(): void | Promise<void>
}

interface AgentToolRuntime {
  composePlan(
    context: RunPersistenceContext,
    plan: PiRunPlan,
    hooks: AgentToolRunHooks,
  ): Promise<PiRunPlan>
  confirm(confirmationId: string, decision: ToolConfirmationDecision): Promise<void>
  undoTurn(runId: string): Promise<readonly string[]>
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

interface AgentRunTraceExport {
  exportVersion: 1
  exportedAt: number
  sessionId: string
  runId: string
  turnId: string
  retryOfRunId?: string
  readOnly: boolean
  startedAt: number
  status: AgentRunStatus
  endedAt?: number
  usage?: AgentUsageView
  error?: AgentErrorView
  toolCalls: AgentRunTraceToolCall[]
  events: AgentUiEvent[]
}

type ExternalLinkDecision =
  | { allowed: true; url: string }
  | { allowed: false; reason: 'malformed' | 'protocol-not-allowed' | 'host-not-allowed' }
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
  redaction before events, persistence, logs, and structured errors. The
  key-name rule intentionally matches anything containing `token`; genuine
  non-credential fields must be listed in `NON_SECRET_KEYS` rather than renamed
  around the rule. `undoToken` is the only current exemption because turn undo
  and FR-013 audit both require it verbatim.
- `exportRunTrace(runId)` is the audit entry point. It joins the run start
  record, terminal record, run-scoped UI events, and `kq.tool.trace` metadata,
  keyed by `result.meta.runId` and `result.meta.toolCallId`. Never derive a run
  from the composite idempotency key string; the key format is not a protocol.
  A tool trace without a matching event is still exported so the audit package
  cannot silently hide an executed tool.
- Opening a session claims ownership of the runs in its snapshot. Without this,
  a relaunched window cannot retry, undo, or export any run it restored, because
  run ownership is otherwise only recorded when a run starts in that window.
- The Electron Main process treats every Renderer-supplied URL as untrusted.
  `shell.openExternal` runs only for URLs that parse, use `https:`, and match
  `EXTERNAL_LINK_ALLOWED_HOSTS` exactly or as a subdomain. `will-navigate` is
  permitted only for the exact application page: compare `pathname` for `file:`
  pages (their origin is always `null`) and `origin` for the dev renderer.
  Decisions live in pure functions so both sides are testable without Electron.
- The provider credential is accepted only by `provider.models` and
  `provider.test` request inputs. Renderer receives bounded model/status/test
  views and must never receive or persist the key. A configuration becomes
  runnable only after catalog, text, and exact harmless tool-call probes pass.
  The runtime identity is `openai-compatible`; 302.ai is one preset, not the
  product default. Fresh status omits Base URL.
- Live evaluation reads `KQ_LLM_API_KEY` or the deprecated alias
  `KQ_302AI_API_KEY`; a missing variable is a
  zero-request skip. Quality evidence is exact-ID evidence: the official model
  catalog marks `gpt-5.6-luna` as a current candidate, while the observed Arena
  rank 63 belongs only to the exact `gpt-5.6-luna-xhigh` row. Never copy a
  variant's Arena rank onto the base model or infer 302.ai availability from
  either source.
- Measured on 2026-08-24 against 302.ai (969 catalog entries, 929 non-legacy):
  `gpt-5.6-luna` is present and Agent-compatible (three-stage probe, 3/3 runs,
  median latency 8056 ms / TTFT 3522 ms), and **no** declared Arena prior matches
  any catalog id — 302.ai ships `gemini-3.7-flash` and `gemini-3-flash-preview`,
  not the exact ranked ids. `paretoModelIds` is therefore structurally empty for
  this Provider. Treat that as correct exact-ID behavior, not a ranking bug; the
  fix is new exact-ID Arena evidence, never a looser match.
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
- Chart execution has one browser-compatible owner: `ChartToolHost` in
  `ai-runtime`. Electron Main uses a transport-neutral `RendererToolProxy`,
  preload adapts a `MessagePort`, and Vue registers the same host used by a Web
  consumer. Main and preload must not import chart internals or implement tool
  behavior.
- Renderer tool messages use protocol version `1`, strict closed TypeBox
  schemas, and a 512 KiB encoded-size limit. Every request and response carries
  the exact `{ windowId, chartId, hostGeneration }` target and `requestId`;
  execute/verify/undo also carry canonical run identity. Replaced ports,
  cancelled requests, late responses, and target/request mismatches never reach
  the active host.
- The first-party chart allowlist is the intersection of the canonical
  registry, implemented host handlers, readiness, and run scope, recomputed for
  every plan. Missing or disposed controllers return
  `TARGET_GONE`/`TOOL_UNAVAILABLE`; there is no mock-result fallback.
- Writes use the last chart revision observed by the run and serialize at the
  host. A mismatch returns `STATE_CONFLICT` before mutation. Successful writes
  return before/after revisions and an opaque Renderer-owned undo token; turn
  undo applies tokens in reverse order and checks the current revision before
  every reversal.
- Idempotency keys are exactly
  `sessionId/runId/toolCallId/toolVersion`. The canonical tool name and input
  are deterministically serialized and SHA-256 hashed. Same-key/same-hash
  replay returns the original canonical result with `idempotentReplay: true`;
  same-key/different-hash returns `DUPLICATE_REQUEST` before policy or host
  dispatch. Bounded trace records survive Renderer reconnects and exclude
  credentials and authorization headers.
- Read-only tools run automatically. Reversible writes require a write-enabled
  run; destructive or external-side-effect policy creates a structured,
  expiring confirmation. Session grants are keyed by session plus normalized
  tool scope and are cleared on runtime shutdown.
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

| Condition                                   | Stable result                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Protocol or payload version mismatch        | `INVALID_PROTOCOL` / `INVALID_PAYLOAD`                                         |
| Expired deadline or oversized payload       | `DEADLINE_EXCEEDED` / `PAYLOAD_TOO_LARGE`                                      |
| Non-main frame or wrong window/chart owner  | `TARGET_MISMATCH`                                                              |
| Reused request ID with different input      | `DUPLICATE_REQUEST`                                                            |
| Missing Provider adapter or credential      | `PROVIDER_NOT_CONFIGURED`                                                      |
| Provider 401 / 403 / 404                    | `PROVIDER_AUTHENTICATION` / `PROVIDER_PERMISSION` / `PROVIDER_MODEL_NOT_FOUND` |
| Provider 429 / 5xx / timeout                | `PROVIDER_RATE_LIMITED` / `PROVIDER_UNAVAILABLE` / `PROVIDER_TIMEOUT`          |
| Malformed output / invalid tool call        | `PROVIDER_MALFORMED_RESPONSE` / `PROVIDER_INCOMPATIBLE_TOOLS`                  |
| Tool/provider deadline or explicit stop     | `TIMEOUT` / terminal cancelled or partial run                                  |
| More than the configured tool-turn limit    | `TOOL_LOOP_LIMIT`                                                              |
| Unknown or unavailable canonical tool       | `UNKNOWN_TOOL` / `TOOL_UNAVAILABLE`                                            |
| Missing/disposed Renderer chart target      | `TARGET_GONE` / `TOOL_UNAVAILABLE`                                             |
| Renderer protocol, payload, target mismatch | `INVALID_PROTOCOL` / `INVALID_PAYLOAD` / `TARGET_MISMATCH`                     |
| Invalid canonical input                     | `INVALID_ARGUMENTS` / `UNKNOWN_FIELD` / `OUT_OF_RANGE`                         |
| Invalid successful tool output              | `INVALID_TOOL_OUTPUT`                                                          |
| Policy or confirmation refusal              | `POLICY_DENIED` / `CONFIRMATION_REQUIRED`                                      |
| Stale write or stale undo revision          | `STATE_CONFLICT` / `UNDO_CONFLICT`                                             |
| Same idempotency key with different input   | `DUPLICATE_REQUEST`                                                            |
| Tool deadline or caller abort               | `TIMEOUT` / `CANCELLED`                                                        |
| Host or verifier throws                     | redacted `TOOL_EXECUTION_FAILED` / `POSTCONDITION_FAILED`                      |
| Unknown future session schema               | `SESSION_SCHEMA_UNSUPPORTED`                                                   |
| Open run found during startup recovery      | persisted `interrupted` run                                                    |

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
- Good: Main asks `RendererToolProxy` for live capabilities for each plan, then
  the shared Renderer host executes and separately verifies Controller state.
- Base: the port is absent or replaced during a request; the call fails with a
  structured target/protocol result and no mutation is reported.
- Bad: Main executes a chart mutation, trusts a Renderer-provided success
  string, reuses a response from another host generation, or retries a write
  without the canonical idempotency key.

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
- Renderer protocol/host: strict parse, byte limit, target generation,
  cancellation, port replacement, controller disposal, exact allowlist,
  revision conflicts, output-before-postcondition ordering, and structured
  verification failure.
- Tool coordinator: read-only filtering, confirmation once/session/expiry,
  canonical-input replay and mismatch, persisted replay after reconnect,
  reverse-order turn undo, repeated undo, partial undo, and `UNDO_CONFLICT`.
- Audit export: merged tool evidence, cross-run isolation, orphan traces kept,
  unknown run rejected, and injected credentials/paths redacted in the export.
- External navigation: every rejected protocol and look-alike host, the exact
  application page allowed, sibling local files blocked, and no reporter wired.
- Release gates: `agent-runtime` coverage thresholds live in `vitest.config.ts`
  (statements/lines >= 90%, branches >= 85%, functions >= 90%; redaction at 100%
  branches). `agent-ci.yml` runs static, unit/contract, Electron E2E, and package
  smoke as required jobs with no `continue-on-error`; real 302.ai evaluation
  stays in `provider-302ai-live.yml`.

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

Chart behavior follows the same ownership rule:

```typescript
// Wrong: Electron Main reaches into chart state.
ipcMain.handle('chart:set-theme', () => controller.setTheme('dark'))

// Correct: Main owns only versioned transport and runtime coordination.
rendererToolProxy.attach(messagePortTransport)
const planWithTools = await agentToolRuntime.composePlan(context, providerPlan, hooks)
```
