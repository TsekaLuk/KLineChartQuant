# Canonical Tool Registry Implementation Plan

## 1. Contract Tests First

- [x] Add Given/When/Then tests for registry uniqueness, complete policy
      metadata, strict schemas, capability re-probe, first-party exposure, and
      unavailable forward contracts.
- [x] Add strict input/output validator tests covering extra fields, coercible
      strings, enum/range/integer/array/nested failures, and issue paths.
- [x] Add canonical executor tests for lookup, capability, policy,
      confirmation, timeout, cancellation, host result, output drift, and
      postcondition order.
- [x] Add a deterministic registry snapshot fixture and red test for drift.

## 2. Canonical Registry

- [x] Add `typebox@1.3.7` as a direct `ai-runtime` dependency.
- [x] Define canonical schema, policy, capability, error, metadata, result,
      registry, projection, and execution-host types in `packages/ai-runtime`.
- [x] Replace the hand-written schemas with strict TypeBox definitions while
      preserving compatible public names and deprecated array views.
- [x] Declare read/query/range forward contracts, audience restrictions,
      built-in unavailable alert/replay status, and explicit sync
      compatibility.
- [x] Compile validators once, reject duplicate definitions, and export stable
      lookup/projection/snapshot helpers.

## 3. Executors

- [x] Implement `executeToolAsync()` with the documented ordered pipeline,
      canonical metadata, typed errors, timeout, and signal composition.
- [x] Retain the current ChartController switch as the compatibility handler and
      route `executeTool()` through canonical validation.
- [x] Remove implicit `CN` defaults and return an explicit ambiguous-instrument
      error before ChartController mutation.
- [x] Reject undeclared sync compatibility and validate legacy handler output.

## 4. Adapters

- [x] Generate MCP catalog entries from a fresh capability projection and
      route calls through `executeToolAsync()`.
- [x] Update MCP server integration so alert/replay are absent and trusted raw
      compatibility tools require an explicit capability opt-in.
- [x] Add `agent-runtime` dependency on `ai-runtime` and implement the Pi
      adapter as an in-process projection over the same executor.
- [x] Preserve the existing Pi driver/faux testing contracts while adding
      registry-backed tools and canonical error projection.
- [x] Add Pi/MCP parity tests for successful output, validation failure, policy
      denial, host failure, capability changes, and operation without MCP.

## 5. Compatibility And Documentation

- [x] Update public exports and mark legacy schema/executor views deprecated.
- [x] Replace tests that expect visible alert/replay, arbitrary first-party
      settings/raw data tools, or an implicit CN market.
- [x] Add the committed schema snapshot and document intentional versioning
      and capability behavior.
- [x] Verify package dependency direction and browser/node export boundaries.

## Validation Commands

Run after focused red/green cycles:

```bash
pnpm --filter @363045841yyt/klinechart-ai-runtime test
pnpm --filter @363045841yyt/klinechart-agent-runtime test
pnpm --filter @363045841yyt/klinechart-ai-runtime build
pnpm --filter @363045841yyt/klinechart-agent-runtime build
pnpm exec eslint packages/ai-runtime packages/agent-runtime
pnpm exec oxlint --deny-warnings packages/ai-runtime packages/agent-runtime
pnpm exec tsc -p packages/ai-runtime/tsconfig.build.json --noEmit
pnpm exec tsc -p packages/agent-runtime/tsconfig.build.json --noEmit
```

Before commit/PR, run the relevant workspace package tests and the Trellis
quality gate. Required tests use zero retries.

## Final Validation Evidence

- 2026-08-24: AI runtime 11 files / 138 tests and Agent runtime 7 files / 35
  tests passed with zero retries.
- Both package builds and independent `tsc --noEmit` checks passed.
- Both packages passed `publint --strict`; Node ESM imports passed for the AI
  root/browser entries and the Agent root entry.
- Scoped ESLint and oxlint passed with zero warnings for the canonical registry,
  executor, adapters, compatibility source, and their new tests.
- `pnpm docs:check`, frozen-lockfile install, Prettier checks for task-owned
  source/spec files, and `git diff --check` passed.
- The broader package lint command still reports pre-existing warnings in MCP
  dev scripts and legacy test fixtures; no new task-owned warning remains.

## Risk And Rollback Points

- `toolSchemas.ts` and `executeTool.ts` are public compatibility surfaces. Keep
  source-compatible exports and isolate deprecation changes in their own
  commits where practical.
- MCP server transport and session routing are already integration-sensitive.
  Land catalog projection before call-path replacement so failures can be
  localized.
- Pi adapter changes must not alter provider or session persistence behavior.
  The adapter must be testable with a fixture host and no MCP transport.
- The snapshot is a gate, not a generator side effect; update it only with a
  reviewed contract/version change.
- Do not persist or migrate runtime state in this task, so rollback requires no
  data migration.

## Start Gate

- [x] `prd.md`, `design.md`, and `implement.md` pass a lossless convergence
      review against parent R4 and source PRD FR-007/012/014, sections 9, 10,
      16-18, 22, and 25.
- [x] No repository-answerable question remains.
- [x] Task is activated on `refactor/canonical-tool-registry`, based on PR #126.
