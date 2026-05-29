import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
// @ts-expect-error — no types ship with the plugin
import babel from 'vite-plugin-babel'

// Map the peer-dep `@klinechart-quant/core` import to the workspace
// neighbour's source so tests don't require a pre-built `dist/`. Production
// consumers resolve via the published package's `main`/`exports`; this
// alias is test-only.
const coreSrc = fileURLToPath(new URL('../core/src/index.ts', import.meta.url))
// `@klinechart-quant/core` re-exports `createChartController`, which imports
// the legacy engine at `<repo>/src/core/chart.ts` — itself written with `@/...`
// path aliases. Mirror the root `vite.config.ts` mapping so transitive imports
// resolve under vitest. (Test-only; published artifacts inline the engine.)
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    plugins: [
        // Upstream added TC39 stage-3 decorators (`@Indicator(...)`) in
        // `src/core/*` (the legacy engine the createChartController bridge
        // imports). vitest's esbuild doesn't recognise that syntax variant,
        // so apply the same babel transform vite.config.ts uses, scoped
        // only to the legacy directory.
        babel({
            include: [/\/src\/core\/.*\.tsx?$/],
            exclude: [/node_modules/, /\/packages\//],
            babelConfig: {
                babelrc: false,
                configFile: false,
                plugins: [
                    ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
                    ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
                ],
            },
        }),
    ],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: [
            { find: '@klinechart-quant/core', replacement: coreSrc },
            { find: /^@\//, replacement: `${repoSrc}/` },
        ],
    },
})
