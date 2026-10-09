# 0001. Canonical product name and wordmark

- Status: Accepted
- Date: 2026-10-09
- Deciders: tseka (Nebutra), wordmark originally by 363045841

## Context

The product name drifts across the codebase:

| Spelling | Where |
|---|---|
| `KLineChartQuant` | screenshot watermark (`useChartScreenshot.ts`), repo name |
| `KlineChartQuant` | on-chart brand link + aria-label (`KLineChart.vue`) |
| `KLineChart Quant` | desktop window title (`desktop-electron/index.html`) |
| `@363045841yyt/klinechart-*` | npm scope |

## Decision

1. **Display name:** `KLineChartQuant` — one word, capital K, L, C, Q. Used in UI, titles, docs, aria-labels, store listings.
2. **Short name:** `KCQ` — for favicon/app icon monogram, PWA `short_name`, subdomain (`kcq.nebutra.com`), tight UI.
3. **Ecosystem form:** `KLineChartQuant by Nebutra` when shown outside the product (Nebutra surfaces, marketing).
4. **Wordmark:** Outfit 600, the existing mark by 363045841. Brand VI derivatives (monogram, glyph, color) build on it; it is not redrawn.
5. **Machine identifiers are unchanged:** npm package names, repo URL, storage keys, and Electron `productName` (`KLineChart Quant`). Electron derives the userData directory from `productName`, so renaming it would orphan local data. Renaming any of these is a separate breaking-change decision.
6. Product strings come from one constant (`BRAND` in shared code) instead of literals.

## Consequences

- Fix `KlineChartQuant` in `KLineChart.vue` and `KLineChart Quant` in the desktop window title.
- The CI spelling check excludes `electron-builder.yml` `productName`.
- Add a lint/grep check in CI rejecting `KlineChartQuant` and `KLineChart Quant`.
