# Canonical Tool Registry Design

## Architecture

The dependency direction is:

```text
@363045841yyt/klinechart-core
                ^
                |
@363045841yyt/klinechart-ai-runtime
  canonical registry + validators + async executor + MCP adapter
                ^
                |
@363045841yyt/klinechart-agent-runtime
  Pi adapter + Pi run driver
                ^
                |
Electron Main / RendererToolProxy (next child task)
```

`ai-runtime` remains transport neutral at the canonical boundary. It owns the
tool definitions, strict validation, capability projection, result/error
contracts, executor orchestration, legacy chart handler binding, and MCP
projection. `agent-runtime` owns the thin Pi SDK adapter because only that
package depends on Pi.

The registry is immutable after construction. Per-turn availability is not:
`projectTools(registry, capabilityContext, audience)` evaluates every entry on
each call and returns a fresh ordered projection plus unavailable diagnostics.

## Canonical Contracts

Each `ToolDefinition<I, O>` contains:

- stable `name`, semantic `version`, registry/schema version, title,
  description;
- TypeBox `inputSchema` and `outputSchema` plus precompiled validators;
- policy metadata: safety, confirmation, reversible, execution mode,
  timeout, and legacy sync compatibility;
- audience metadata for first-party Pi, trusted MCP, and SDK compatibility;
- a pure capability function;
- optional postcondition descriptor/hook.

The executor receives host behavior through a `ToolExecutionHost` rather than
embedding Electron or Pi dependencies. A host maps tool names to async handlers
and returns a canonical host outcome carrying output and optional revisions,
undo token, replay flag, content, or a typed domain error.

## Validation

TypeBox schemas are the only schema source. Validators are compiled once when
the registry is built. Validation never mutates input and never enables
coercion/default insertion.

All `Type.Object` uses set `additionalProperties: false`. Dynamic indicator
parameter maps are represented by a schema-constrained record whose values are
limited to finite number, string, or boolean; this is an intentional domain
map rather than an open arbitrary object. Raw settings retain only a legacy,
trusted audience and are never projected to first-party Pi.

Validation errors are normalized to ordered issues with `path`, `keyword`, and
`message`. The executor maps them to canonical codes such as
`INVALID_ARGUMENTS`, `UNKNOWN_FIELD`, and `OUT_OF_RANGE` without depending on
human message text.

## Execution Flow

```text
lookup
  -> capability/audience check
  -> compiled input validation
  -> application policy and confirmation hook
  -> timeout + caller AbortSignal
  -> host handler
  -> compiled output validation
  -> optional postcondition verification
  -> canonical ToolResult metadata
```

Every exit, including pre-handler failures, returns the same result envelope.
The executor owns duration and contract IDs. Host code may add chart/data
revisions, undo token, and idempotent replay metadata. Timeout and cancellation
are differentiated. Unknown thrown values are converted to a redaction-ready
`TOOL_EXECUTION_FAILED` error and never leak stack traces through the contract.

The executor accepts a policy hook now so Pi and MCP parity includes policy.
The concrete Agent chart policy, session grants, mutation queue, optimistic
revision, idempotency, and undo store are supplied by the chart-tools child.

## Tool Exposure

The canonical registry contains implemented compatibility tools and forward
contracts needed by the P0 architecture. Availability is derived from both the
entry's built-in status and the host capability context.

First-party Pi excludes:

- `data.appendData` and `data.updateData`;
- arbitrary `settings.update`;
- every alert/replay contract while unavailable;
- any declared contract whose host capability is absent.

Trusted MCP may expose raw compatibility tools only when its capability
context explicitly opts into them. Alert/replay remain unavailable to every
audience until implemented. New read/query/range tools remain declared but
unavailable until the chart-tools host supplies them.

`agent.capabilities` reports the same projection and reason codes through an
injected handler; it does not bypass capability filtering.

## Adapter Design

### Pi

`createPiTools()` evaluates the registry for a run/turn and mechanically maps
each projected entry to `RuntimeToolDefinition`. Its execute closure calls the
canonical executor in process, using the Pi-supplied `AbortSignal`. Pi content,
summary, evidence, and undo fields derive from the canonical result.

The existing Pi run driver stays unaware of MCP. The transitional
`RuntimeToolDefinition` type remains public, but its registry-backed instances
are generated rather than hand-authored by application code.

### MCP

`createMcpToolCatalog()` maps the same projected entries to MCP declarations.
`createMcpCallHandler()` invokes the same canonical executor and returns text
content plus `structuredContent`; MCP `isError` is `!result.ok`.

The existing WebSocket chart session is adapted as one possible execution
host. Session routing remains explicit in the call context; this task removes
schema divergence but does not expand P1 multi-window routing.

## Legacy Compatibility

The public arrays and `findTool()` can remain as deprecated views over the
registry to limit package churn. They must not be used as model-visible
catalogs. `ALL_TOOLS` means all registered contracts, not all currently
available model tools.

The synchronous `executeTool(chart, call)` validates with the canonical
compiled input/output schemas and dispatches only entries marked
`syncCompatible`. It returns the legacy core result shape for source
compatibility. Async-only entries return a deterministic compatibility error.
No instrument market default is added at the executor boundary.

## Snapshot And Versioning

A deterministic JSON snapshot serializes registry version, tool name/version,
schemas, policy, audiences, and built-in availability. Function bodies and
runtime capability results are excluded. CI compares the generated value with
the committed snapshot.

Any contract change requires an intentional snapshot update. Breaking input or
output changes require a tool version bump; a registry version bump records a
catalog-wide contract release.

## Rollout And Rollback

1. Add canonical contracts and tests without deleting compatibility exports.
2. Move legacy schema exports onto registry-derived views.
3. Route the legacy executor through compiled validation.
4. Add MCP and Pi mechanical adapters plus parity tests.
5. Let the chart-tools child supply concrete async Renderer handlers and make
   forward contracts available.

Rollback is file-scoped: compatibility exports and the old sync call signature
remain available, so adapter integration can be reverted without changing
ChartController public APIs. No persistent data migration occurs in this task.

## Trade-offs

- The registry declares some unavailable forward contracts. This preserves one
  source of truth and capability reason reporting while ensuring models never
  see promises the host cannot fulfill.
- TypeBox becomes a direct `ai-runtime` dependency. This is preferable to
  importing Pi's dependency transitively and keeps schema ownership explicit.
- Raw mutators remain representable for trusted compatibility clients, but the
  default audience is deny. Removing them outright would be a larger breaking
  SDK change and is not required for Alpha safety.
