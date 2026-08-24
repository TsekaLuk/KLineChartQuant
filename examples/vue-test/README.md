# KLineChart Vue Test

Pre-publish smoke test for `@363045841yyt/klinechart`. Installs from **npm registry** via `npm install` — not linked to the monorepo workspace.

## Usage

```bash
# Install from npm (not workspace)
npm install

# Dev server
npm run dev

# Production build (type-check + bundle)
npm run build
```

## Update to latest published version

```bash
npm install @363045841yyt/klinechart@latest @363045841yyt/klinechart-core@latest
```

> **Note**: Use `npm install`, not `pnpm`. The root monorepo uses pnpm workspace, which would link local packages instead of fetching from registry.
