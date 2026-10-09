# 0003. Bilingual UI (zh-CN / en)

- Status: Accepted
- Date: 2026-10-09
- Deciders: tseka

## Context

All UI strings and aria-labels are hardcoded Chinese. No i18n library.

## Decision

- Support `zh-CN` and `en` across the landing page and the app.
- Library: `vue-i18n` (composition API, typed message schema).
- Default locale `en`. Resolution: explicit user choice (persisted) → `navigator.languages` best match → `en`. Public pages use path locales (`/home` en as `x-default`, `/zh/home`).
- `<html lang>` follows the active locale.
- Message keys are namespaced by feature. Brand name (ADR 0001) is not translated.
- `/home` locale variants are crawlable (`hreflang`).

## Consequences

- Every new user-visible string goes through `t()`; enforced by lint on `.vue` templates.
- Migration is incremental per feature; Chinese is the source locale during migration.
