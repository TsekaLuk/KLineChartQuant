# Architecture Decision Records

One decision per file, `NNNN-kebab-title.md`, never renumbered. Supersede instead of editing an accepted ADR's decision.

Status: `Proposed` → `Accepted` → (`Superseded by NNNN` | `Deprecated`).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-product-name-and-wordmark.md) | Canonical product name and wordmark | Accepted |
| [0002](0002-app-routing-root-to-app.md) | App routing: `/` enters `/app`, landing at `/home` | Accepted |
| [0003](0003-bilingual-ui.md) | Bilingual UI (zh-CN / en) | Accepted |
| [0004](0004-design-token-scope.md) | Design token scope and no-raw-values rule | Proposed |
| [0005](0005-renderer-freeze.md) | Renderer is out of scope for the design overhaul | Accepted |
| [0006](0006-settings-instant-apply.md) | Settings apply instantly; no draft copy | Accepted |
| [0007](0007-brand-accent-instrument-cobalt.md) | Brand accent: Instrument Cobalt | Accepted |

Template:

```md
# NNNN. Title
- Status:
- Date:
- Deciders:
## Context
## Decision
## Consequences
```

## Cross-repo decisions (nebutra-sailor `docs/architecture/`)

- 2026-10-09 kcq product surface: routing, indexed `/home`, `brand.domains.kcq`
- 2026-10-09 framework-agnostic design foundation: tokens/fonts/i18n/analytics/primitives without React
- 2026-10-09 kcq brand architecture: endorsed product brand, Brand Package in Sailor
