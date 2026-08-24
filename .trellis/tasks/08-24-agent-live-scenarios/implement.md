# Implementation Plan

## Checklist

1. [x] Neutralize Provider identity, errors, and defaults. Add preset catalog
      and live-env resolver. Empty Base URL on fresh status.
2. [x] Electron persistence: write generic filenames, read legacy 302.ai
      files, delete both. Seed live E2E from `KQ_LLM_*`.
3. [x] Shared settings dialog: preset select fills Base URL; Custom stays
      editable; copy no longer titles the dialog "302.ai".
4. [x] Keep §12.4 system prompt and prompt-injection tests. Point live
      golden scenarios at `KQ_LLM_*` with the deprecated key alias.
5. [x] Update unit / Vue / Electron tests so product defaults are generic
      and 302.ai appears only as a preset or fixture.
6. [x] Update `agent-runtime.md` and run scoped tests.

## Validation

```bash
pnpm --filter @363045841yyt/klinechart-agent-runtime test
pnpm --filter @363045841yyt/klinechart-agent-runtime coverage
pnpm --filter @363045841yyt/klinechart test -- src/features/agent
pnpm --filter @363045841yyt/klinechart-desktop exec vitest run
```

Live (opt-in, not PR CI):

```bash
KQ_LIVE_E2E=1 KQ_LLM_API_KEY=... KQ_LLM_MODEL=... \
  pnpm --filter @363045841yyt/klinechart-desktop test:e2e:live
```

## Risky files

- `packages/agent-runtime/src/provider-302ai/*`
- `packages/desktop-electron/electron/main.ts`
- `packages/desktop-electron/electron/provider-storage.ts`
- `packages/vue/src/features/agent/components/AgentSettingsDialog.vue`

## Rollback

Leave legacy `agent-provider-302ai-*.json` in place. If the generic runtime
regresses, revert the PR; old files still load in the previous build.
