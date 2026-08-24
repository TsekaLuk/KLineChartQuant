# Canonical Tool Registry

## Goal

Replace the hand-written MCP catalog and weak executor boundary with one
versioned, capability-aware tool registry that is the source of truth for
strict schemas, execution policy metadata, structured results, and Pi/MCP
adapters.

## User Value

The first-party Agent sees only tools that can actually run in the current
chart context, receives deterministic validation and recovery information, and
behaves the same whether a contract is exercised in-process through Pi or by
an external MCP client.

## Confirmed Facts

- This child owns parent requirement R4 and source PRD FR-007, FR-012, and
  FR-014. It prepares the contract surface needed by FR-008 through FR-011 but
  does not own their chart mutation semantics.
- `packages/ai-runtime/src/toolSchemas.ts` currently uses a hand-written
  `JsonSchema`, exposes unavailable alert/replay entries, and publishes raw
  data mutators plus arbitrary `settings.update` without an audience-aware
  capability projection.
- `packages/ai-runtime/src/executeTool.ts` validates only missing required
  fields and silently supplies `CN` for ambiguous instruments.
- `packages/ai-runtime/src/mcpServer.ts` publishes `ALL_TOOLS` directly and
  routes calls through a separate legacy result shape.
- `packages/agent-runtime/src/pi/types.ts` defines a second Pi-specific tool
  contract. The first-party runtime executes tools in process and must never
  depend on a local WebSocket or stdio MCP loopback.
- The canonical implementation is stacked on PR #126 (`feat/native-pi-runtime`)
  and must not depend on the 302.ai Provider PR.
- Source PRD section 25 resolves all product choices needed for this task; no
  blocking product question remains.

## Requirements

### CTR-001: One Versioned Registry

- Maintain one registry whose entries own stable name and version, title and
  description, TypeBox-compatible input and output schemas, safety,
  confirmation, timeout, reversibility, execution mode, legacy compatibility,
  capability evaluation, and optional postcondition metadata.
- Preserve existing v1 tool names where they remain supported. A breaking
  schema change requires a tool-version change; compatible additions must be
  optional.
- Expose typed lookup and deterministic contract serialization for CI
  snapshots. Duplicate names are rejected.

### CTR-002: Strict Input And Output Validation

- Compile validators from the canonical TypeBox schemas and validate without
  coercion; values such as `"14"` must never become `14`.
- Object schemas are closed with `additionalProperties: false` unless an
  explicitly documented domain map requires schema-constrained dynamic keys.
- Enforce required fields, types, enums, integer/number bounds, string
  constraints, array bounds, patterns, and nested schemas.
- Validate successful tool output before returning it. Contract drift becomes
  a structured, non-success result rather than unchecked data.
- Validation failures must have stable codes and machine-readable issue paths;
  recovery must not depend on parsing message text.

### CTR-003: Capability Projection And Exposure Policy

- Probe capabilities whenever a run/turn tool list is built; do not cache an
  availability decision across turns.
- Omit `available=false` entries from Pi and MCP catalogs and preserve a reason
  code for `agent.capabilities` and diagnostics.
- Keep alert/replay unavailable until their state machines exist.
- Hide `data.appendData`, `data.updateData`, and arbitrary `settings.update`
  from first-party Pi. Trusted SDK/MCP compatibility may retain explicitly
  capability-gated access to legacy raw mutators.
- Declare new read contracts (`agent.capabilities`, `chart.getContext`,
  `chart.getState`, `indicators.listActive`, `indicators.query`) and
  `navigation.setVisibleRange`; keep them unavailable until the host supplies
  an implementation.

### CTR-004: Canonical Async Execution Boundary

- Provide an asynchronous canonical executor that performs, in order: tool
  lookup, capability check, strict input validation, policy/confirmation hook,
  timeout and AbortSignal composition, host execution, output validation, and
  optional postcondition verification.
- Return one discriminated result envelope with stable error code,
  `retryable`, optional `retryAfterMs`, and metadata including request/run/tool
  call IDs, tool version, schema/registry version, duration, revisions when
  supplied, undo token when supplied, and idempotent replay when supplied.
- Distinguish cancellation, timeout, unavailable, policy, invalid input,
  invalid output, host/domain, and postcondition failures without string
  matching.
- Keep deprecated `executeTool()` for declared `sync-compatible` tools only.
  It must use the same schema contract and must reject async-only or undeclared
  tools instead of bypassing the registry.

### CTR-005: Mechanical Pi And MCP Adapters

- Generate Pi and MCP tool declarations from the same capability-projected
  registry entries; neither adapter may carry a separately authored schema or
  safety catalog.
- Route both adapters through the same canonical executor so identical
  fixtures produce identical validation, policy, domain result, and error
  behavior.
- Pi invocation remains an in-process function call. External MCP transport
  availability or failure must not affect first-party Agent availability.
- MCP results use protocol content plus the canonical structured result; the
  `isError` flag mirrors the canonical success discriminant.

### CTR-006: Compatibility And Test Evidence

- Keep public compatibility exports where practical and make any deprecated
  surface explicit.
- Update existing tests that encode conflicting legacy behavior, including
  `CN` defaults and visible alert/replay catalog entries.
- Commit a deterministic schema snapshot and adapter parity fixtures.
- Cover unknown tools, missing/extra/wrong/coerced fields, bounds, unavailable
  capability, capability changes across turns, output drift, policy denial,
  confirmation requirement, timeout, cancellation, domain error mapping, and
  Pi/MCP independence.

## Constraints

- The registry and transport-neutral executor live in `packages/ai-runtime`;
  Pi SDK adaptation lives in `packages/agent-runtime` and consumes that public
  contract without introducing a reverse dependency.
- No first-party call may open a local MCP connection.
- No API key or Provider credential belongs in tool inputs, schemas, metadata,
  logs, snapshots, or fixtures.
- This task does not claim completion of chart revision, idempotency, undo,
  Renderer proxy, or concrete mutation postconditions; those belong to
  `08-23-agent-chart-tools`.
- Electron security/lifecycle hardening and full E2E/live gates belong to
  `08-23-agent-hardening`.

## Acceptance Criteria

- [x] One canonical registry supplies every published Pi/MCP input schema,
      output schema, version, policy metadata, and capability decision.
- [x] Compiled validation rejects missing, extra, wrong-type, out-of-range,
      non-integer, malformed nested, and coercible-but-invalid inputs before a
      host handler runs.
- [x] Invalid successful output becomes a structured `INVALID_TOOL_OUTPUT`
      failure.
- [x] A capability change is visible on the next projection, and unavailable
      tools are absent from both adapter catalogs.
- [x] First-party Pi catalogs exclude raw K-line mutators, arbitrary settings,
      and unavailable alert/replay tools.
- [x] The async executor returns the canonical structured result/error envelope
      and enforces policy, timeout, AbortSignal, output validation, and optional
      postcondition hooks in the documented order.
- [x] Deprecated sync execution works only for registry entries explicitly
      marked sync-compatible and shares strict validation with async execution.
- [x] Pi and MCP adapter parity tests prove the same validation, policy, domain
      result, and structured error for identical fixtures.
- [x] A Pi parity test succeeds with no MCP server or WebSocket running.
- [x] Contract/schema snapshot detects accidental version or schema drift.
- [x] `pnpm --filter @363045841yyt/klinechart-ai-runtime test`,
      `pnpm --filter @363045841yyt/klinechart-agent-runtime test`, both package
      builds, relevant type checks, and lint pass with zero retries.

## Out Of Scope

- Concrete chart write serialization, revision conflict retry, idempotency
  storage, undo tokens/groups, and mutation postconditions.
- Implementing alert or replay state machines.
- Provider networking, model selection, credentials, or live-model evaluation.
- New visual UI or Electron-only component trees; Electron continues to host
  the shared Web/Vue component architecture.

## Open Questions

None.
