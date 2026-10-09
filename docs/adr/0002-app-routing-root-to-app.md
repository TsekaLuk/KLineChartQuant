# 0002. App routing: `/` enters `/app`, landing at `/home`

- Status: Accepted
- Date: 2026-10-09
- Deciders: tseka

## Context

`kcq.nebutra.com` serves a single-page preview (`packages/vue/preview/App.vue`) with no router. A marketing landing page is required.

## Decision

Follow the Vercel pattern: the product is the front door.

- `/` redirects to `/app` (the trading workspace).
- `/app` is the workspace.
- `/home` is the landing page (bilingual, SEO-indexed, prerendered).
- Router: `vue-router`. `/home` is code-split so the workspace bundle doesn't ship landing/shader code, and vice versa.
- nginx keeps the SPA fallback; `/home` gets prerendered HTML for crawlers and OG.

## Consequences

- Deep links and shared workspace URLs live under `/app`.
- Canonical URL for SEO is `/home`; `/app` is `noindex`.

## Where it is implemented

`kcq.nebutra.com` is served by nebutra-sailor `apps/kcq`, which wraps this repo's source. The router
and landing are built there; see Sailor ADR 2026-10-09 kcq product surface. This repo's `preview/`
remains the library demo.
