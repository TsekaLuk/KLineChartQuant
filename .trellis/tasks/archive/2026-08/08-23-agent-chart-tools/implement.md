# Agent Chart Tools - Implementation Plan

## 1. Integrate Completed Dependencies

- [ ] Create `feat/agent-chart-tools` from
      `refactor/canonical-tool-registry`.
- [ ] Integrate the completed Core facade commits from upstream PR #125 and the
      real Provider commits from upstream PR #127 without duplicating their
      implementations.
- [ ] Resolve runtime, App, and lockfile conflicts in favor of canonical Pi
      tools, real production Provider composition, and faux-only E2E mode.
- [ ] Record the stacked dependency chain and PR base in task metadata.

## 2. Write Contract Tests First

- [ ] Add strict Renderer protocol parse, size, version, target, and cancel
      tests.
- [ ] Add canonical executor ordering tests proving output validation precedes
      live postcondition verification.
- [ ] Add allowlist tests for read-only, write-enabled, trusted MCP, not-ready,
      and hidden/unimplemented feature projections.
- [ ] Add policy tests for denial, confirmation, expiry, cancel, confirm once,
      and session-scoped grants.
- [ ] Add idempotency, revision, and undo tests before implementing their
      stores.

## 3. Core Read And Navigation Surface

- [ ] Extend the stable Agent and public Controller surface with bounded state
      projections required by `chart.getState` and undo snapshots.
- [ ] Implement and unit-test pure timestamp-range-to-viewport geometry.
- [ ] Add the public exact visible-range mutation and return actual range,
      clamping flags, and updated revision.
- [ ] Add deterministic instrument identity resolution with zero, one, and many
      result branches and no market fallback.
- [ ] Update Core mocks and package-boundary exports without exposing internal
      state modules.

## 4. Shared Browser Chart Tool Host

- [ ] Implement each read and write handler in one browser-compatible host.
- [ ] Add per-chart write serialization, pre-state capture, opaque undo tokens,
      cancellation, and disposal.
- [ ] Implement bounded `chart.getState` and postcondition readers for every
      write tool.
- [ ] Preserve user markers while replacing or clearing only Agent-owned
      markers.
- [ ] Return stable structured errors for controller readiness, arguments,
      instruments, state conflict, postcondition, and undo conflict.

## 5. Runtime Proxy, Policy, And Persistence

- [ ] Implement transport-neutral `RendererToolProxy` and request lifecycle
      registry.
- [ ] Add `AgentToolRuntime` composition after Provider plan creation so real
      and faux Providers use the same canonical tools.
- [ ] Implement read-only enforcement and structured confirmation waiters.
- [ ] Implement exact idempotency key and hash lookup plus bounded persisted
      result records in the session service.
- [ ] Build per-turn undo groups, reverse-order undo, partial failure records,
      and replay recovery.
- [ ] Preserve failed canonical results through `PiRunDriver` rather than
      projecting generic `TOOL_ERROR`.

## 6. Electron Transport And Shared Vue Wiring

- [ ] Multiplex Agent UI events and Renderer tool protocol messages over the
      existing MessagePort with strict target checks.
- [ ] Expose only a narrow host-registration callback through preload; keep
      context isolation, sandboxing, and no Node access in Renderer.
- [ ] Add shared Vue lifecycle wiring from `KlineChart.getController()` to the
      browser host and use it in Web preview and Electron Renderer.
- [ ] Remove any production fallback that can yield scripted or faux replies;
      retain explicit E2E mode only.
- [ ] Keep production Provider selection and discovery from PR #127, including
      the current `gpt-5.6-luna` candidate.

## 7. Shared Layout Regression

- [ ] Reproduce the white-surface and swallowed chart-inset issue in browser
      and Electron screenshots before changing styles.
- [ ] Fix shell and chart spacing and backgrounds with shared Vue theme tokens.
- [ ] Verify no Electron-only visual override is needed.

## 8. Golden Scenarios

- [ ] Cover context and compact indicator reads.
- [ ] Cover indicator add, update, remove, and exact range navigation.
- [ ] Cover theme and zoom, primary and comparison resolution, drawing, and
      marker mutations.
- [ ] Cover confirmation, rejection, expiry, and session-scoped grant
      boundaries.
- [ ] Cover duplicate delivery, different-input duplicate, reconnect,
      `STATE_CONFLICT`, postcondition failure, cancellation, and target loss.
- [ ] Cover reverse-order turn undo, repeated undo, and `UNDO_CONFLICT`.
- [ ] Assert real Controller state plus persisted canonical trace for every
      scenario; chat text alone is insufficient.

## 9. Verification

- [ ] Run focused Core, AI runtime, Agent runtime, Vue, and Electron tests.
- [ ] Run full tests and builds for all changed packages.
- [ ] Run independent `tsc --noEmit` checks for changed package configs.
- [ ] Run scoped ESLint and oxlint with zero new warnings and Prettier checks.
- [ ] Run `publint --strict` and Node ESM and browser package smoke imports.
- [ ] Verify canonical schema snapshot and parity plus frozen lockfile install.
- [ ] Run Playwright browser and Electron E2E with deterministic faux mode and
      zero retries.
- [ ] Capture light and dark, wide and narrow screenshots and inspect chart
      inset, backgrounds, resize handle, and panel overlap.
- [ ] Run the opt-in live 302.ai compatibility evaluation only through an
      environment variable; do not print, persist, or commit the supplied key.

## 10. Review, Documentation, And PR

- [ ] Use `trellis-check` for full spec, data-flow, reuse, lint, type, test, and
      package review; fix all in-scope findings.
- [ ] Update backend and frontend Trellis specs with the shared host, Renderer
      protocol, idempotency, revision, undo, and real/faux boundary contracts.
- [ ] Re-run the full quality gate after spec updates.
- [ ] Commit only task-owned files, archive the task, push the branch, and open
      a PR with dependency links to upstream PRs #125-#127 and fork PR #7.

## Risk And Rollback Points

- Dependency integration is the first rollback point; do not mix conflict
  resolution with chart-tool implementation.
- Core viewport geometry is isolated behind pure tests before transport work.
- Session schema additions remain append-only and versioned.
- Renderer protocol registration is capability-gated; disabling registration
  removes model-visible chart tools without disabling the real Provider.
- Keep unrelated untracked Trellis, bootstrap, and local store files untouched.
