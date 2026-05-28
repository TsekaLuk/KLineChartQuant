# Angular 19 SSR Smoke — `@klinechart-quant/angular`

Minimal Angular 19 + `@angular/ssr` app that proves `@klinechart-quant/angular`
is **SSR-safe**: importing `KLineChartComponent` on the server (during prerender
or render-on-demand) must not crash, and DOM access must be gated to the client
via `isPlatformBrowser`.

## What this proves

| Boundary | File | Contract verified |
| --- | --- | --- |
| Module import on server | `src/app/app.component.ts` | Adapter loads at top of a standalone component used in an SSR-enabled app |
| Server-platform guard | `KLineChartComponent` (adapter source) | `ngAfterViewInit` exits early when `isPlatformBrowser(inject(PLATFORM_ID))` is false |
| Build pipeline | `ng build` | Angular's server bundle compiles and the prerender pass succeeds |

The KEY assertion is in **`src/app/app.component.ts`** — importing
`KLineChartComponent` at module top level from a component reachable by SSR.
If the adapter regressed (e.g., touched `document` at import), `ng build`
would fail during the server bundle's evaluation.

## Versions targeted

| Tool | Version |
| --- | --- |
| Angular | 19.x (standalone, no NgModule) |
| `@angular/ssr` | 19.x |
| Node | ^20.19 / >=22.12 (matches repo root) |
| zone.js | 0.15 (used in browser; not active in zoneless mode) |

This example uses **`provideExperimentalZonelessChangeDetection()`** — the
adapter component is `OnPush` and the signal-based viewport bridge fits the
zoneless model cleanly.

## How to scaffold + run

Because the full Angular workspace needs `angular.json`, `tsconfig.app.json`,
`tsconfig.server.json`, `server.ts`, and an `assets/` config — and the
Angular CLI is the only safe authority on the current schema — this example
ships the **distinctive files** (the component, the bootstraps, this README)
and asks you to scaffold the surrounding workspace with the CLI:

```bash
cd examples/angular-universal

# 1. Use the Angular CLI to scaffold the workspace shell into the current dir.
#    Answer: routing? no. stylesheet? css. SSR? YES.
pnpm install
pnpm dlx @angular/cli@19 new angular-universal \
  --directory=. \
  --routing=false \
  --style=css \
  --ssr \
  --skip-git \
  --skip-install

# 2. Replace the generated src/app/app.component.ts and src/main.{ts,server.ts}
#    with the ones already in this directory (they are the smoke test).
#    The CLI's defaults are fine for everything else.

# 3. Build the SSR bundle — this is the smoke test.
pnpm install
pnpm build

# 4. (optional) run the SSR server locally
pnpm start
```

A successful `pnpm build` is the verification — Angular emits both browser and
server bundles, prerenders the root route, and the build pipeline does not
crash on the adapter's server-side import.

## Why this isn't fully self-contained

`@angular/cli` regenerates the workspace shell (angular.json, tsconfigs,
server.ts) based on the user's CLI version. Hardcoding those files would rot
quickly across Angular minor releases. The KEY contract the smoke verifies —
that the adapter's `ngAfterViewInit` uses `isPlatformBrowser` — is owned by
the files this example DOES ship.

## Current limitations

- The chart engine itself is not visually rendered on the server — the smoke
  proves import + server bundle build + client hydration.
- This example is intentionally isolated from `pnpm -r test` so it never
  blocks unrelated CI runs.

## Files shipped

```
examples/angular-universal/
├── src/
│   ├── app/
│   │   └── app.component.ts       # standalone; imports KLineChartComponent
│   ├── main.ts                    # client bootstrap (zoneless)
│   └── main.server.ts             # server bootstrap (zoneless + platform-server)
├── package.json                   # private, workspace:* dep on @klinechart-quant/angular
└── README.md
```

The Angular CLI fills in `angular.json`, `tsconfig*.json`, `server.ts`,
`index.html`, and the `assets/` directory when you scaffold per step 1 above.
