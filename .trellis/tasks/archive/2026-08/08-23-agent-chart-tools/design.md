# Agent Chart Tools - Technical Design

## Architecture And Ownership

There is one chart execution implementation. The browser-compatible host owns
Controller access, mutation snapshots, and postcondition reads. Electron owns
only the cross-process transport needed because Pi runs in Main.

```text
                         shared browser code
  KlineChart ref -> ChartController -> ChartToolHost
                                      ^          |
                                      |          | execute / verify / undo
                Web direct adapter ---+          |
                                                 |
  Electron Renderer adapter <-> preload MessagePort adapter
                                      |
                                      v
                         RendererToolProxy (Main)
                                      |
                         AgentToolRuntime coordinator
                         /          |            \
                 Pi adapter     policy/confirm   undo/idempotency
                                      |
                              real 302.ai Provider
```

`packages/ai-runtime` remains the canonical tool contract owner and gains the
browser chart host and any executor hook needed for post-output verification.
`packages/agent-runtime` owns Pi projection, policy coordination, idempotency,
turn groups, persistence projections, and a transport-neutral
`RendererToolProxy`. `packages/vue` owns only lifecycle wiring from the exposed
KlineChart controller to the shared host. `packages/desktop-electron` adapts the
proxy and host registration to the existing secure MessagePort.

## Dependency Integration

The implementation branch starts from `refactor/canonical-tool-registry` and
integrates, without rewriting, the completed commits behind upstream PR #125
and #127. The chart-tools PR documents these dependencies. Conflict resolution
must preserve the Provider branch's real production composition and the
registry branch's canonical adapters.

The Core facade remains the owner of immutable context and compact indicator
queries. This task adds only the state/mutation surface required by chart tools,
including exact visible-range navigation and bounded state needed for
verification.

## Shared Contracts

### Renderer Protocol

Use a strict discriminated protocol with a shared version and bounded payloads:

- `host.capabilities`: returns readiness, chart ID/revision, and supported tool
  names.
- `tool.execute`: carries target identity, canonical execution identity, tool
  name/version, validated input, and observed chart revision.
- `tool.verify`: carries the same identity plus validated output and expected
  after revision.
- `tool.undo`: carries target identity, opaque undo token, and expected current
  revision.
- `tool.cancel`: aborts an in-flight request.
- Result envelopes carry either structured data/meta or a structured
  `ToolError`; thrown messages are not protocol contracts.

Every response echoes request, target, and protocol identity. Electron rejects
non-main-frame registration and target mismatch before attaching a port. The
proxy rejects late responses after cancellation, timeout, or port replacement.

### Canonical Postcondition Hook

Extend `executeToolAsync` with a host postcondition verifier invoked after
canonical output validation. The order is:

```text
registry lookup -> capability -> input validation -> policy/confirmation
-> target validation -> Renderer execute -> output validation
-> Renderer state verification -> canonical result
```

The existing definition verifier remains a default; a host verifier supplies
the live Controller read. This avoids claiming success from a Renderer-provided
boolean and preserves one canonical result envelope.

## Run Composition And Policy

Provider support creates the model/stream base plan. `AgentApplicationService`
then asks an `AgentToolRuntime` to project tools for the run target and scope.
This keeps Provider code independent of chart transport and allows the faux
Provider to exercise the exact same tool runtime in E2E.

The runtime recomputes capabilities per run. Read-only runs filter write tools
and policy rejects them again if called. Write-enabled runs treat the UI scope
as explicit permission for reversible writes. Destructive tools create a
pending confirmation, emit a structured UI event, suspend only that tool call,
and resolve through `confirmTool`.

Session grants are keyed by `sessionId + toolName + normalized scope`; they are
memory/session state, not a global preference. Confirmation timeout, rejection,
run cancellation, port closure, or app shutdown rejects the waiter and never
dispatches the mutation.

## Read State And Capability Projection

`ChartToolHost` reads:

- `controller.agent.getContext()` for chart/instrument/range revisions;
- `controller.agent.queryIndicator()` for compact evidence;
- public signals for theme, viewport, symbols, indicators, drawings,
  comparisons, and custom markers.

New public projections remain detached and read-only. `chart.getState` returns
only fields required by postconditions; it never transfers bars or private
engine objects to Main or model context.

The host's `supportedTools` set is the intersection of implemented dispatch
handlers and runtime readiness. The registry remains the sole source for
schemas, policies, names, versions, and audience restrictions.

## Exact Visible-Range Navigation

Core gains a public timestamp-range operation backed by a pure geometry helper:

1. Validate finite ordered timestamps and locate the inclusive requested bar
   indexes in the active loaded series.
2. Reject no-overlap ranges. Record whether either boundary was clamped.
3. Select the supported zoom level whose visible bar capacity most closely
   contains the requested span, preferring containment over cropping.
4. Compute logical scroll from bar index, candle spacing, plot width, DPR, and
   the existing left-load buffer; update zoom and scroll in one controlled
   transaction.
5. Read the resulting visible indexes and translate them back to timestamps.

The result includes actual `from`/`to` and clamping flags. Unit tests cover
irregular timestamps, first/last bars, one-bar ranges, oversized ranges,
timeshare rejection or handling, DPR rounding, and disposed/no-data charts.

## Instrument Resolution

Resolution is a pure filter over current symbols and the registered symbol
catalog. Normalize only casing and whitespace that the existing identity model
declares insignificant. Filter by every supplied identity field. Do not infer a
market from symbol shape.

- One match: project the complete stable `SymbolSpec` or instrument identity.
- No match: `INSTRUMENT_NOT_FOUND`.
- Multiple matches: `AMBIGUOUS_INSTRUMENT` with a bounded list of
  market/exchange/source candidates.

Primary replacement preserves explicit period and adjustment overrides.
Comparison resolution uses the same resolver. Postconditions compare stable
identity keys rather than raw symbol alone.

## Revision Model

The Core facade's `chartRevision` is the optimistic concurrency token. The
runtime records the revision returned by each context/state read per run.
Writes require that observed revision; after a successful verified write, the
runtime advances the run's observation to `chartRevisionAfter`.

Per-chart writes use one promise queue. Immediately before mutation, the host
compares expected and current revision. A mismatch returns `STATE_CONFLICT`
without capturing undo state or mutating. Human interaction or another run
therefore invalidates stale plans predictably.

## Idempotency And Persistence

The coordinator builds:

```text
key = sessionId + runId + toolCallId + toolVersion
```

It hashes canonical name/input separately. Lookup happens before policy and
Renderer dispatch. Same key/hash returns the stored canonical result with only
`idempotentReplay` changed. Same key/different hash returns
`DUPLICATE_REQUEST`.

Persist a bounded tool execution record in the existing versioned session log:
key, input hash, canonical result, target ID, timestamps, and undo metadata.
Replay rebuilds the index after Main restart or reconnect. Redaction runs before
write; Provider credentials and headers are never part of a tool record.

## Undo Model

Before each reversible mutation, the Renderer host captures only the affected
slice:

- Theme, zoom, and navigation: theme or viewport range and zoom.
- Primary and comparison: complete affected `SymbolSpec` values.
- Indicators: definition, role, params, and affected instance identity.
- Drawings: affected objects or complete list for clear.
- Markers: Agent-owned marker map.

The host stores the snapshot behind an opaque token and returns the token with
before/after revisions. The Main coordinator persists ordered successful tokens
per turn. Failed postconditions also retain an available token so a partial
mutation can be recovered.

Undo checks current revision, applies inverse operations in reverse token order,
verifies the prior semantic state, and advances expected revision. An indicator
removed and re-added may receive a new internal instance ID; the undo
postcondition uses definition, role, and params while the trace records the
replacement ID. Drawing IDs and user-owned markers are preserved exactly.

## Marker Ownership

Track Agent-owned marker IDs per chart and session. `markers.update` replaces
only that owned set and merges it with existing user markers. `markers.clear`
removes only the authorized Agent set unless a broader explicitly confirmed
scope is introduced. Undo snapshots and postconditions operate on the same
ownership boundary.

## Structured Failure Projection

`CanonicalPiToolError` already carries the failed canonical result. The Pi
driver records it by public tool-call ID and projects its exact code, retryable
flag, details, revisions, and undo token to the UI and session trace. Unknown
thrown errors alone map to a generic execution failure.

The model receives structured error JSON so it can re-read after
`STATE_CONFLICT`, ask for instrument disambiguation, or stop after a policy
denial. It never receives a fabricated success summary.

## Shared Layout Fix

Repair the workbench shell and chart slot spacing and background using existing
theme tokens in `packages/vue`. The chart band owns a stable inset independent
of panel width, and shell surfaces inherit the active theme. Electron `App.vue`
does not add a one-off background or padding override.

Visual verification covers browser preview and packaged Electron at wide,
narrow, light, and dark viewports. The resize handle and drawer transition must
not consume the chart inset.

## Compatibility And Migration

- Tool names and registry versioning rules remain stable. New fields are
  optional for trusted MCP compatibility unless a major version is introduced.
- Existing legacy synchronous MCP execution remains available for declared
  compatible tools but is not used by first-party Pi.
- Session log additions are versioned and replay ignores unknown future entry
  types.
- Core additions are public and additive; no internal `DataState` is exported.
- Production model selection remains user-configured from Provider catalog;
  `gpt-5.6-luna` is a current evaluation candidate, not a hard-coded mandatory
  model.

## Rollback

The feature is additive behind tool capability registration. If transport or
verification fails, production can project no chart tools while retaining the
real text Provider and read-only UI. Reverting the task removes protocol
messages, host registration, session entries, and additive Core APIs without a
database rewrite; unknown log entries remain safely ignored.
