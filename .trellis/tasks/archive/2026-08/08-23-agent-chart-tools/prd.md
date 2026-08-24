# Agent Chart Tools

## Goal

Complete the read -> mutate -> verify -> undo loop for the native Agent while
keeping chart execution in the shared browser/Renderer architecture. Electron
adds only Main/preload transport; it must not gain a second chart or Agent UI
implementation.

## User Value

An analyst can ask the real Provider-backed Agent to inspect and change the
visible chart, see structured evidence for the actual result, undo the turn,
and trust that retries, reconnects, or duplicate tool delivery cannot apply a
mutation twice.

## Confirmed Baseline And Dependencies

- Source requirements are FR-008 through FR-011, the tool policy matrix,
  PR-05, and section 25 of
  `/Users/tseka_luk/Downloads/KLineChartQuant_Native_Agent_PRD_v1.0.md`.
- The shared Vue/Web `KlineChart` owns `ChartController` and exposes it through
  `getController()`. Electron renders that same component and owns only
  Main/preload transport.
- Upstream PR #125 (`feat/core-agent-facade`) already implements
  `ChartController.agent.getContext()` and `queryIndicator()`. This task must
  integrate that completed dependency rather than recreate it.
- Fork PR #7 (`refactor/canonical-tool-registry`) owns strict schemas,
  capability projection, Pi/MCP parity, policy hooks, timeouts, structured
  results, and the canonical async executor.
- Upstream PR #127 (`feat/provider-302ai`) owns production Provider access. Its
  current fast frontier candidate is `gpt-5.6-luna`; `gpt-5.5-instant` is not a
  current candidate. Production responses must use the real configured API.
- The faux Provider remains allowed only in deterministic tests and E2E mode.
- `AgentApplicationService.confirmTool()` and `undoTurn()` are currently
  stubs. Main sends UI events to Renderer through a `MessagePort`, but tool
  request/result routing is not implemented yet.
- The current synchronous legacy executor rejects a missing market instead of
  defaulting to CN. It is compatibility code, not the first-party execution
  path.

## Requirements

### R1. Shared Renderer Tool Host

- Implement one browser-compatible chart tool host against `ChartController`.
  Vue/Web and Electron Renderer must consume the same host and contracts.
- Add a transport-neutral `RendererToolProxy` for Main-side execution.
  Electron may adapt it to `MessagePort`, but chart behavior must not live in
  Electron Main or preload.
- Route strict, versioned execute, verify, undo, capability, cancellation, and
  target-lifecycle messages across the Renderer boundary.
- Reject stale or mismatched window/chart/protocol/request targets before a
  tool reaches the chart.
- A missing or disposed controller returns `TARGET_GONE` or
  `TOOL_UNAVAILABLE`; it never falls back to a mock result.

### R2. Implemented First-Party Allowlist

- First-party projection may expose only host-implemented tools:
  `agent.capabilities`, `chart.getContext`, `chart.getState`,
  `chart.scrollToRight`, `chart.setTheme`, `chart.zoomIn`, `chart.zoomOut`,
  `chart.zoomToLevel`, `data.setSymbols`, `data.addComparisonSymbol`,
  `data.removeComparisonSymbol`, `drawing.add`, `drawing.clear`,
  `drawing.remove`, `drawing.setTool`, `indicators.add`,
  `indicators.listActive`, `indicators.query`, `indicators.remove`,
  `indicators.updateParams`, `markers.clear`, `markers.update`, and
  `navigation.setVisibleRange`.
- `data.appendData`, `data.updateData`, arbitrary `settings.update`, alerts,
  and replay remain absent from first-party model tools.
- Trusted MCP/SDK compatibility remains governed by the canonical registry;
  this task must not fork or hand-maintain a second schema catalog.
- Capabilities are recomputed for each run and reflect chart readiness,
  read-only scope, host support, and current feature availability.

### R3. Stable Reads And Exact Navigation

- Implement the forwarded read tools through the stable Core facade and
  detached chart-state projections. Compact indicator text is returned
  unchanged and is never reverse-parsed.
- `chart.getState` contains bounded revisions, theme, actual visible timestamp
  range, active indicator instances, comparison identities, drawing IDs, and
  authorized marker IDs needed by postconditions.
- Add a public Core operation for `navigation.setVisibleRange` based on loaded
  bar timestamps and viewport geometry, not DOM event simulation.
- The operation rejects non-finite/reversed/out-of-data ranges, chooses the
  closest supported zoom geometry, scrolls deterministically, and returns the
  actual visible timestamp range.
- For a fully loaded request, the actual range contains the requested range
  and each boundary differs by no more than one adjacent bar. Clamping is
  explicit in the returned result and never reported as an exact success.

### R4. Unambiguous Instruments

- Resolve primary and comparison instruments from current/registered catalog
  identities using symbol plus any supplied market, exchange, and source.
- Exactly one matching identity executes. Zero matches return
  `INSTRUMENT_NOT_FOUND`; multiple matches return `AMBIGUOUS_INSTRUMENT` with
  bounded disambiguation details.
- No execution path silently inserts `market: "CN"` or chooses the first
  catalog match.
- Tool postconditions compare the resolved stable identity, not display text.

### R5. Policy And Structured Confirmation

- Application policy runs before Renderer dispatch. Read-only tools execute
  automatically; write tools are denied in read-only runs.
- Reversible writes execute automatically only in a run whose UI scope allows
  writes. Destructive or broader-scope operations require a structured
  confirmation event.
- `drawing.clear` always requires confirmation. Marker operations can mutate
  only Agent-owned markers; clearing a broader scope requires confirmation.
- Confirmation supports reject, confirm once, and allow the specified tool and
  scope for the current session. A session grant must not authorize other
  tools, scopes, sessions, or future app launches.
- Rejection/expiry returns a structured failure and the request never reaches
  Renderer.

### R6. Optimistic Revision And Idempotency

- Every write is serialized per chart and is based on a revision observed by a
  preceding chart read or successful write in the same run.
- If current `chartRevision` differs before execution, return
  `STATE_CONFLICT`, include the current bounded revision, and do not mutate.
  One re-read/replan retry is allowed by the Agent loop.
- Deduplicate by the exact key
  `sessionId/runId/toolCallId/toolVersion` before policy or mutation replay.
- Repeating a key with the same canonical input returns the first canonical
  result with `idempotentReplay: true`. Reusing it with different input returns
  `DUPLICATE_REQUEST` and never executes.
- Persist enough canonical result metadata in the local session store for a
  Renderer transport reconnect to preserve deduplication. Secrets and raw
  authorization headers are never persisted.

### R7. Per-Mutation Undo And Turn Groups

- Every successful reversible write captures the minimal pre-state and returns
  an opaque `undoToken` plus before/after chart revisions.
- Successful reversible mutations in one turn form an ordered undo group.
  `undoTurn(runId)` applies tokens in reverse order and emits `tool.undone` for
  each completed reversal.
- Undo verifies the expected current revision before every reversal. External
  or later chart changes return `UNDO_CONFLICT` without applying a stale undo.
- Repeated undo is idempotent. Partial undo reports exactly which tokens were
  reversed and leaves auditable state for retry or manual recovery.
- Destructive-but-reversible operations such as confirmed `drawing.clear`
  retain their snapshot. Hidden raw data mutators remain irreversible.

### R8. Machine-Verifiable Completion

- All write results pass canonical output validation before a separate
  Renderer state read verifies the postcondition.
- Verification covers theme, zoom/scroll, visible range, primary/comparison
  identity, indicator instance/params, drawing presence/absence, and
  Agent-owned marker contents.
- A failed or timed-out postcondition returns `POSTCONDITION_FAILED`; the Pi
  result and UI retain the structured canonical code, retryability, revisions,
  and any available undo token.
- `PiRunDriver` must not collapse canonical failures into generic
  `TOOL_ERROR`, and the assistant must not receive a success result for a
  failed postcondition.

### R9. Real Provider And Deterministic Quality Gates

- The production Electron composition uses the real 302.ai support from
  upstream PR #127 and never a scripted reply path.
- Model discovery/evaluation treats `gpt-5.6-luna` as the current fast OpenAI
  candidate and does not label `gpt-5.5-instant` current.
- Deterministic unit/contract/E2E suites may use the faux Provider only under
  explicit test/E2E mode. At least one live, opt-in evaluation proves a real
  API response and real tool-call compatibility without exposing the API key.
- Golden scenarios assert Controller state and canonical trace, not chat text
  alone: context read, RSI add/update/remove, exact range, theme/zoom, primary
  and comparison instrument resolution, drawing/marker mutations,
  confirmation/rejection, duplicate delivery, state conflict, postcondition
  failure, cancellation, and reverse-order turn undo.

### R10. Shared Layout Regression

- Fix the reported shared workbench regression where a white surface appears
  against the active theme and the chart's outer inset is swallowed.
- The fix belongs to shared Vue/Web layout styles. Electron may not carry a
  separate visual override for the same workbench.
- Desktop and browser screenshots at light/dark and narrow/wide viewports show
  a visible consistent chart inset, no unintended white band, and no overlap
  between chart, resize handle, and Agent panel.

## Acceptance Criteria

- [ ] Browser and Electron Renderer use the same chart tool host; Electron
      Main/preload contain transport and security adaptation only.
- [ ] First-party Pi lists exactly the implemented allowlist for the active
      scope and never lists raw data, arbitrary settings, alerts, or replay.
- [ ] All forwarded reads use the stable Core facade and preserve compact
      indicator text without parsing.
- [ ] Exact visible-range navigation meets the loaded-bar boundary tolerance
      and returns the actual verified range.
- [ ] Ambiguous instruments return `AMBIGUOUS_INSTRUMENT`; no tested path
      silently defaults to CN or a first catalog match.
- [ ] Policy denial/rejection/expiry produces zero Renderer mutation; scoped
      session grants cannot escape their tool/scope/session.
- [ ] Duplicate delivery returns the original result, mismatched duplicates are
      rejected, and reconnect does not apply the mutation twice.
- [ ] Every reversible write has revisions and an undo token; turn undo runs in
      reverse order and stale undo returns `UNDO_CONFLICT`.
- [ ] Every write has a state-based postcondition; failed verification remains
      a structured failure through Pi, persistence, and UI.
- [ ] Production uses the real API path with `gpt-5.6-luna` as the current fast
      candidate; faux output is restricted to deterministic test/E2E mode.
- [ ] Golden scenarios pass without retries and assert both Controller state
      and persisted canonical trace.
- [ ] Shared browser/Electron screenshots prove the themed background and
      chart outer inset regression is fixed on desktop and mobile-width views.
- [ ] Relevant package tests, builds, independent type checks, strict publish
      checks, scoped lint, schema snapshots, and Electron E2E all pass.

## Out Of Scope

- Real trading, account access, alerts, replay, raw model-driven K-line writes,
  arbitrary chart settings, cloud synchronization, or multi-agent workflows.
- A separate Electron chart/workbench implementation.
- Making faux/scripted replies available in production.
- General multi-window routing and Renderer crash recovery beyond contracts
  needed for this P0 single-window target; exhaustive lifecycle hardening
  remains in `08-23-agent-hardening`.
