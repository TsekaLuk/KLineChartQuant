import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
// @ts-expect-error — no types ship with the plugin
import babel from 'vite-plugin-babel'

// The createChartController bridge imports the legacy engine at
// `../../../../src/core/chart.ts`. That module uses `@/...` aliases for its
// own internal imports, which vitest cannot resolve without help — so we
// mirror the root `vite.config.ts` alias here. This is test-only: production
// builds will inline the engine or apply an equivalent path map.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    plugins: [
        // Upstream added TC39 stage-3 decorators (`@Indicator(...)`) in
        // `src/core/*` (the legacy engine the createChartController bridge
        // imports). Mirror the babel transform from the root `vite.config.ts`,
        // scoped only to the legacy directory.
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
        // Bench files are discovered by `vitest bench` separately; restrict
        // them here so `vitest run` (the test command) does not pick them up
        // and try to run them as tests.
        benchmark: {
            include: ['src/**/*.bench.ts'],
        },
    },
    resolve: {
        alias: [{ find: /^@\//, replacement: `${repoSrc}/` }],
    },
})
