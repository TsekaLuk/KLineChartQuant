# KQ Agent Workbench P0

## Goal

Deliver the v0.10.x Agent Alpha described by
`/Users/tseka_luk/Downloads/KLineChartQuant_Native_Agent_PRD_v1.0.md`: a native
Electron financial-analysis agent that shares the chart's deterministic state,
uses strongly validated tools, verifies every mutation, and preserves an
auditable and reversible run history.

## User Value

An analyst can ask for indicator evidence and chart changes in natural
language, see the tool evidence and real chart result, stop or retry work,
undo the current turn, and resume the session after restarting the desktop app.

## Confirmed Baseline

- The source requirement is PRD v1.0 dated 2026-08-23, targeting v0.10.x Alpha.
- The current fork branch is two commits ahead of its old base and 510 commits
  behind `upstream/main`; the source PRD was written against the latter.
- `upstream/main` already contains the required `packages/core`,
  `packages/ai-runtime`, and `packages/desktop-electron` baseline.
- The existing indicator query returns compact semantic text and must not be
  reverse-parsed into a fabricated numeric DTO.
- P0 is the Alpha completion scope. PRD P1, real trading, cloud sync, RAG,
  multi-agent operation, mobile, and raw model-driven K-line mutation are not
  Alpha deliverables.

## P0 Requirements

### R1. Native Workspace And Interaction

- Satisfy FR-001, FR-004, and the P0 portions of FR-003.
- Provide a collapsible 360-640 px desktop sidebar, resize-safe chart layout,
  small-window drawer behavior, session/model/scope header, message timeline,
  tool and confirmation cards, context chips, read-only mode, composer, stop,
  retry, and follow-up flows.
- Preserve drafts when provider setup is required and expose loading, empty,
  streaming, error, cancelled, partial, confirmed, completed, and undone states.
- Do not expose model chain of thought or raw Pi events to the UI.

### R2. Provider, Sessions, And Privacy

- Satisfy FR-002, FR-003, FR-004, FR-013, and FR-016.
- Run Pi and provider networking in Electron Main; API keys must never enter
  Renderer, logs, traces, error stacks, snapshots, or test artifacts.
- Support 302.ai base URL, model discovery and selection, three-stage connection
  testing, encrypted credential deletion, local versioned session persistence,
  rename/delete/recovery, streaming, cancellation, retry branches, trace and
  usage capture, and interrupted-run recovery.

### R3. Stable Core Agent Facade

- Satisfy FR-005 and FR-006.
- Expose `ChartController.agent.getContext()` and
  `ChartController.agent.queryIndicator(input): Promise<string>` through stable
  package exports without exposing `DataState` or internal agent paths.
- Context and query metadata must be serializable, revision-aware, bounded, and
  consistent with the context observed when the query began.
- Preserve compact semantic output and the default 20 / hard limit 2000 query
  behavior without result-pool writes or text reverse parsing.

### R4. Canonical Tool Contract

- Satisfy FR-007, FR-012, and FR-014.
- Maintain one versioned registry that owns TypeBox-compatible input/output
  schemas, strict validation, capability, safety, confirmation, timeout,
  reversibility, execution mode, structured errors, and postconditions.
- Generate Pi and MCP adapters from the registry. First-party Pi execution is
  in-process and must not depend on a local MCP loopback.
- Keep the legacy synchronous executor only for declared compatible tools and
  add an asynchronous canonical executor for query and cross-process tools.
- Never expose unavailable alert/replay tools, raw data mutators, or arbitrary
  settings updates to the first-party model.

### R5. Verified And Reversible Chart Operations

- Satisfy FR-008, FR-009, FR-010, and FR-011.
- Expose only implemented navigation, indicator, comparison, drawing, marker,
  and narrow settings capabilities; add exact `navigation.setVisibleRange`.
- Reject ambiguous instruments instead of silently defaulting to CN.
- Enforce schema, capability, policy, optional confirmation, target validation,
  execution, output validation, and postcondition validation in that order.
- Serialize writes; enforce optimistic revisions; deduplicate by
  `sessionId/runId/toolCallId/toolVersion`; issue per-mutation undo tokens; group
  a turn's mutations for reverse-order undo; surface conflicts explicitly.

### R6. Security, Reliability, And Accessibility

- Apply the Electron security baseline and the security requirements in PRD 14.
- Every provider/tool operation must have timeout and AbortSignal behavior.
- Reject invalid IPC sender/protocol/target/payload combinations and close or
  cancel work safely on Renderer reload, crash, window close, or port closure.
- All controls must be keyboard reachable, streaming announcements throttled,
  statuses not color-only, and focus restored deliberately after confirmation,
  error, and completion.
- Meet the PRD 15 performance, reliability, portability, and observability
  budgets for the P0 single-window path.

### R7. Deterministic And Live Quality Gates

- Follow the TDD order in PRD 16.2 and cover every boundary family in PRD 17.
- Implement all E2E-001 through E2E-020 with Controller/state assertions, not
  chat-text-only or screenshot-only assertions.
- Deterministic suites and golden scenarios must pass 100% with zero retries.
- Validator, policy, idempotency, revision, and redaction branches must reach
  100%; `agent-runtime` statements must reach 90% and branches 85%.
- Provide required static, unit/contract, Electron E2E, and package smoke CI
  jobs without `continue-on-error`.
- Provide a separately triggered 302.ai live workflow and prove the PRD 19.2
  thresholds with zero safety, secret, or unconfirmed-destructive violations.

## Child Deliverables

| Task | Owned Deliverable | Primary Requirements |
| --- | --- | --- |
| `08-23-agent-workspace-ui` | Native UI, stable UI contract, fake runtime | R1, accessibility slice of R6 |
| `08-23-core-agent-facade` | Core context/query facade and export | R3 |
| `08-23-native-pi-runtime` | Pi loop, sessions, events, cancellation, IPC | R2, runtime slice of R6 |
| `08-23-canonical-tool-registry` | Strict registry and Pi/MCP parity | R4 |
| `08-23-agent-chart-tools` | Policy, renderer proxy, verified mutations, undo | R5 |
| `08-23-provider-302ai` | Credentialed provider and live harness | Provider slice of R2 and R7 |
| `08-23-agent-hardening` | Security, lifecycle, performance, CI, final audit | Remaining R6 and R7 |

## Cross-Child Acceptance Criteria

- [ ] The six P0 user tasks in PRD 0.3 complete through the packaged Electron
      app and leave a verified Controller state and trace.
- [ ] All R1-R7 requirements have direct code, test, runtime, or CI evidence.
- [ ] The seven child tasks pass their own acceptance criteria and full-scope
      integration review shows no contract drift between them.
- [ ] Pi and MCP share validation, policy, execution result, and error behavior;
      first-party runtime remains independent of MCP transport availability.
- [ ] Every model-visible tool is available and implemented; unavailable,
      dangerous, and raw mutation tools are absent.
- [ ] No API key or authorization secret appears in Renderer, persisted data,
      exported trace, logs, failures, snapshots, or CI artifacts.
- [ ] Deterministic gates pass 100%; the explicitly enabled live suite meets all
      PRD release thresholds and stays within its configured cost budget.
- [ ] Documentation, migrations, schema snapshots, release notes, and package
      exports describe the shipped behavior.

## Out Of Scope

- PRD P1-only functionality, including full multi-window routing, bidirectional
  chart-object location, general configurable confirmation policy, rich cost
  dashboards, and batch undo/redo beyond required turn undo.
- All items explicitly excluded by PRD 4.3 and all Horizon 2/3 roadmap work.

## Open Questions

None. PRD section 25 resolves the product and architecture defaults needed to
begin implementation. Live verification may later require a valid
`KQ_302AI_API_KEY`, but its absence does not block deterministic development.
