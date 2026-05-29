# Changesets

This directory holds [Changesets](https://github.com/changesets/changesets)
files for `@klinechart-quant/*` versioning. The package CLI is not yet
installed in the repo (see `package.json` devDependencies) — config
ships ahead of the tooling so a future contributor can add the CLI
without re-deriving config decisions.

## Conventions

- **Linked packages** (configured in `config.json`): the five
  publishable packages — `core`, `ai-runtime`, `react`, `vue`,
  `angular` — release together at the same version. This keeps
  peer-dep ranges sane during the pre-1.0 churn.
- **`ui-schema`** is intentionally ignored — it's an internal
  registry package, not published to npm.

## Workflow (once the CLI is installed)

```bash
# Add the CLI:
pnpm add -wD @changesets/cli @changesets/changelog-github

# Record an intentional change (interactive prompt):
pnpm changeset

# Cut a version locally (rewrites package.jsons + CHANGELOGs):
pnpm changeset version

# Publish (typically run by CI on tag push):
pnpm changeset publish
```

Until the CLI lands, the `CHANGELOG.md` files in each package are
maintained by hand. The current `[Unreleased]` section in each
captures the contents of PR #24 ("foundation drop").

## Why config without the CLI?

The choice is documented in `LOOP_LEDGER.md` (tick 23) and
`docs/PR_SPLIT_GUIDE.md`. Short version: installing `@changesets/cli`
adds dependencies that need network + lockfile churn; the loop
deferred that to a tick where install is already needed. The config
file commits the structural decision (linked packages, ignored
packages, public access, base branch) so it survives that deferral.
