# KQ Agent Workbench P0 - Execution Plan

## 0. Baseline Integration

- [ ] Merge `upstream/main` into the fork branch while preserving the two local
      commits and all Trellis/user files. The content merge and conflict
      resolution are complete; the merge commit remains intentionally pending
      because project policy requires explicit user authorization to commit.
- [x] Install the upstream workspace lockfile with frozen resolution.
- [x] Record baseline versions and run root typecheck, package tests, build,
      docs check, and lint before Agent edits.
- [x] Inspect upstream package-scoped guidance and update child plans with exact
      file paths and any baseline failures.
- Rollback point: the pre-merge commit plus untracked Trellis files; do not mix
  Agent feature edits into the baseline merge resolution.

## 1. Child Delivery Sequence

- [ ] `08-23-agent-workspace-ui`: event contract, fake runtime, complete UI
      states, component tests, basic Electron E2E.
- [ ] `08-23-core-agent-facade`: public context/query facade and boundary tests.
- [ ] `08-23-native-pi-runtime`: Pi lifecycle, persistence, stable events,
      cancellation/retry, versioned IPC and fake Renderer integration.
- [ ] `08-23-canonical-tool-registry`: strict schema registry, async executor,
      capability/policy/error envelope, Pi/MCP parity and snapshots.
- [ ] `08-23-agent-chart-tools`: allowlisted tools, visible range, resolver,
      renderer proxy, idempotency/revision/undo/postconditions and golden E2E.
- [ ] `08-23-provider-302ai`: Main-only credentials, models/probes, provider error
      behavior, settings UX, deterministic provider tests and live workflow.
- [ ] `08-23-agent-hardening`: all remaining boundary/security/lifecycle,
      performance, migration, package smoke, CI, docs and release evidence.

Each child receives its own converged `prd.md`, `design.md`, and `implement.md`,
loads package guidance through `trellis-before-dev`, follows test-first execution,
passes `trellis-check`, and is archived before the next dependent child starts.

## 2. Full-Scope Verification

- [ ] Root frozen install and lockfile consistency.
- [ ] Root lint, docs generation check, typecheck, package build, and package tests.
- [ ] Agent runtime coverage: statements >= 90%, branches >= 85%.
- [ ] Validator, policy, idempotency, revision, and redaction branch coverage 100%.
- [ ] Contract/schema snapshots and Pi/MCP parity.
- [ ] IPC serialization, sender, lifecycle, cancellation, timeout, retry tests.
- [ ] Electron E2E-001 through E2E-020 with retries disabled.
- [ ] Packaged Electron smoke and security configuration inspection.
- [ ] Secret scan over Renderer bundles, logs, traces, snapshots, reports, and
      persisted fixtures.
- [ ] 302.ai live evaluation when `KQ_302AI_API_KEY` is available, including
      threshold/cost report and zero safety violations.

Canonical commands will be updated after the upstream baseline is integrated;
the expected entry points are root `pnpm lint`, `pnpm type-check`, `pnpm build`,
`pnpm test:packages`, package-scoped Vitest/coverage, and Playwright Electron.

### Baseline Snapshot (2026-08-23)

- Node `v26.4.0`, pnpm `11.13.1`; frozen install and Electron native dependency
  install pass.
- `pnpm build:packages` exits zero, but Vue declaration generation reports two
  real `IndicatorRuntimeDescriptor.defaultConfig` type errors.
- `pnpm docs:check` passes.
- Core: 192 test files / 2214 tests pass. ai-runtime: 8 files / 117 tests pass
  when local loopback ports are allowed. Angular: 12 pass / 1 todo.
- Vue has 7 baseline failures because Node 26 localStorage has no backing file.
- Root typecheck has baseline Vue, Core test, React web-component declaration,
  and test-only typing errors. Root lint has 27 errors and 2244 warnings.
- Root `test:unit` finds no tests because the config excludes `packages/**` and
  the root source suite was migrated. Hardening owns this CI/documentation drift.

## 3. Final Audit And Release

- [ ] Map every P0 FR, business invariant, boundary family, E2E ID, NFR budget,
      Definition-of-Done item, and CI job to direct evidence.
- [ ] Confirm P1 and roadmap work was not claimed as Alpha completion.
- [ ] Update project specs/ADRs with stable conventions learned during delivery.
- [ ] Run `trellis-check` full-scope verification and resolve every finding.
- [ ] Record migrations, release notes, packaged app version, and rollback path.
- [ ] Archive all child tasks, then complete and archive this parent task.
