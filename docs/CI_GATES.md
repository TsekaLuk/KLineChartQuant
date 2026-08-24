# CI Gates

This file documents the quality gates wired into `.github/workflows/library-ci.yml`
and their current enforcement state. **Updating this file is part of changing a
gate's enforcement level** — if you flip a step from `continue-on-error: true` to
required, update the table here in the same PR.

## Gate matrix

| Gate                          | Tool                          | Scope             | State    | Promotion blocker                                                                |
|-------------------------------|-------------------------------|-------------------|----------|----------------------------------------------------------------------------------|
| Package unit tests            | `pnpm -r test` (vitest)       | All workspaces    | REQUIRED | —                                                                                |
| Legacy root vitest suite      | `./node_modules/.bin/vitest`  | Root `src/`       | REQUIRED | —                                                                                |
| Bundle size budgets           | `size-limit`                  | core/react/vue/ng | WARN     | Pre-build measurement off `src/index.ts`; needs real `dist/` for accurate gzip.  |
| Publish hygiene (exports/types/main) | `publint --strict`     | core/react/vue/ng | WARN     | publint needs `dist/` to verify file existence under `pkg.exports`.              |
| Type-resolution (ESM + CJS)   | `@arethetypeswrong/cli` (attw)| core/react/vue/ng | WARN     | attw runs against `npm pack` output, which is empty until `tsc --build` works.   |
| Per-package build             | `pnpm -r build` (tsc)         | All workspaces    | WARN     | Each package's `build` script points to `tsconfig.build.json` which doesn't exist yet. |
| Coverage threshold            | `@vitest/coverage-v8`         | Root              | NOT WIRED| Intentionally deferred until Round 1E lands real engine code worth covering.     |

## Per-package bundle budgets

These are pre-build, source-based measurements (`size-limit` reads from
`packages/<x>/src/index.ts`). They will be re-measured against `dist/index.js`
once the build pipeline lands.

| Package | Limit (gzip) | Today's measurement | Rationale                                                                 |
|---------|--------------|---------------------|---------------------------------------------------------------------------|
| core    | 30 KB        | ~1.6 KB             | Headroom for signals + controller scaffolding + a minimal indicator set.  |
| react   | 8 KB         | ~0.8 KB             | Thin wrapper around core (`use*` hooks); peers excluded from the budget.  |
| vue     | 8 KB         | ~1.1 KB             | Thin composable layer; `vue` excluded from the budget.                    |
| angular | 10 KB       | ~1.2 KB             | Angular decorator runtime traditionally adds 1–2 KB; extra slack on top.  |

If a limit trips, **do not raise it reflexively** — first check whether a tree
shake or peer-dep externalization is the right move.

## Publishing readiness (Round 1E target)

When Round 1E lands and we are ready to publish:

1. Add a `tsc --build` step before `size:packages` / `lint:publish` / `lint:types`
   in `library-ci.yml`.
2. Flip the three warn-only gates to required (remove `continue-on-error: true`).
3. Re-baseline the size budgets against the real `dist/index.js`.
4. Verify `publishConfig.provenance: true` is honored by the publish workflow
   (it requires `id-token: write` permission and OIDC-enabled runners — already
   the default on `ubuntu-latest`).

## Top-2 promotion priority (maintainer guidance)

When promoting warn-only gates to required, do them in this order:

1. **`publint --strict`** — cheapest to fix, catches broken `exports`/`main`/
   `types` paths before a user ever installs the package. Failure here means
   the package is literally unimportable.
2. **`size-limit`** — once budgets are baselined against real `dist/`, this is
   the single best regression alarm for accidental dependency bloat or losing
   tree-shakability (e.g., a stray side-effectful import).

`attw` is valuable but the hardest of the three to satisfy cleanly; promote it
third, after `exports` shape has stabilized post-Round-1E.

## Local commands

```bash
pnpm test:packages     # workspace tests
pnpm size:packages     # bundle budgets
pnpm lint:publish      # publint --strict, every publishable package
pnpm lint:types        # attw --pack, every publishable package
```
