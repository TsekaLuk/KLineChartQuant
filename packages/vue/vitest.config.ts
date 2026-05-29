import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
// @ts-expect-error — no types ship with the plugin
import babel from 'vite-plugin-babel'

// Legacy engine root — needed so `@/...` imports inside src/core/chart.ts
// resolve while the package transitively loads createChartController.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    plugins: [
        vue(),
        // Upstream's `@Indicator(...)` decorators in `src/core/*` (loaded
        // transitively via createChartController). Mirror the root
        // `vite.config.ts` babel transform, scoped to the legacy directory.
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
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: [
            // Order matters: subpath aliases MUST be listed before the
            // bare package alias so vite's longest-prefix match wins.
            {
                find: '@klinechart-quant/core/reactivity',
                replacement: new URL('../core/src/reactivity/index.ts', import.meta.url).pathname,
            },
            {
                find: '@klinechart-quant/core/controllers',
                replacement: new URL('../core/src/controllers/index.ts', import.meta.url).pathname,
            },
            {
                find: '@klinechart-quant/core',
                replacement: new URL('../core/src/index.ts', import.meta.url).pathname,
            },
            { find: /^@\//, replacement: `${repoSrc}/` },
        ],
    },
})
