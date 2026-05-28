# Nuxt 3 SSR Smoke — `@klinechart-quant/vue`

Minimal Nuxt 3 app that proves `@klinechart-quant/vue` is **SSR-safe**:
importing the adapter on the server must not crash, and `useChart` must mount
only in the browser via Vue's `onMounted` lifecycle.

## What this proves

| Boundary | File | Contract verified |
| --- | --- | --- |
| Module import on server | `pages/index.vue` (`<script setup>`) | Adapter loads at top of a page — SSRed by default in Nuxt 3 — without touching `window` / `document` |
| Client mount via `onMounted` | same | `useChart(ref, opts)` only touches DOM after Vue's mounted hook |
| Build pipeline | `nuxt build` | No `ReferenceError: window is not defined` in the SSR prerender pass |

The KEY file for the SSR-safety contract is **`pages/index.vue`** — it imports
`@klinechart-quant/vue` at module top level inside a route that Nuxt SSRs by
default. If the adapter regressed and accessed `window` at module init, this
build would fail.

## Versions targeted

| Tool | Version |
| --- | --- |
| Nuxt | 3.14+ |
| Vue  | 3.5+  |
| Node | ^20.19 / >=22.12 (matches repo root) |

## How to run

This example is **not** part of the root pnpm workspace (see top-level
`examples/README.md` for the rationale). Install + build from inside the
example:

```bash
cd examples/nuxt-app
pnpm install
pnpm build
```

A successful `pnpm build` is the verification — Nuxt's SSR pipeline runs and
must not crash.

If you run `pnpm dev`, the composable mount path will throw
`No ChartController factory registered` until a factory is wired (the adapter
auto-registers the production factory from `@klinechart-quant/core` in
Round 1E; this example uses workspace `:*` so it should Just Work). That's
the runtime contract — **the SSR build pass is the smoke test, not runtime**.

## Current limitations

- The chart engine itself is not visually rendered — the smoke proves import
  + SSR build + client commit, not pixels.
- This example is intentionally isolated from `pnpm -r test` so it never
  blocks unrelated CI runs.
- `transpile: ['@klinechart-quant/vue', '@klinechart-quant/core']` is set in
  `nuxt.config.ts` because the adapter ships ESM-only `.ts` sources via the
  workspace; once a `dist/` is published, the transpile entry can be dropped.

## Files

```
examples/nuxt-app/
├── pages/
│   └── index.vue       # <script setup> useChart with real ref
├── app.vue             # Minimal app shell
├── nuxt.config.ts      # ssr: true, transpile workspace packages
├── package.json        # private, workspace:* dep on @klinechart-quant/vue
└── README.md
```
