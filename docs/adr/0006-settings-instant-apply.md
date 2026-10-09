# 0006. Settings apply instantly; no draft copy

- Status: Accepted
- Date: 2026-10-09
- Deciders: tseka

## Context

`ChartSettingsDialog.vue` holds a local draft (`settings = ref(loadSettings())`, :383) that is committed on 确定 (:408). Theme presets bypass it and apply immediately (:413). This creates a derived copy and two write paths. Both are rejected by the README principles ("The Agent is the user"; StateKernel single source of truth). If an Agent changes a setting while the dialog is open, the stale draft overwrites the Agent's change.

Platform guidance (Microsoft settings guidelines, cited in the task research `trading-ui-benchmark.md` §4.2) also prefers instant apply.

## Decision

- Every settings control dispatches the same action the Agent would. There is no dialog-local draft.
- Remove 重置 / 取消 / 确定. The dialog closes with × or Esc.
- Each section has 恢复默认 (restore defaults), followed by an Undo toast.
- Explicit commit is kept only for credential forms (data-source keys), scoped to that form.
- The nested color-preset modal becomes an inline expander.

## Consequences

- Settings become observable and agent-addressable like any other action.
- Undo is required on reset paths.
- E2E tests cover "Agent changes a setting while the dialog is open".
