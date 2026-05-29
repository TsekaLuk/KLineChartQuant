import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
// @ts-expect-error — no types ship with the plugin
import babel from 'vite-plugin-babel'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))
// Legacy engine root — needed so `@/...` imports inside src/core/chart.ts
// resolve while the package transitively loads createChartController.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    plugins: [
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
        include: ['src/**/*.test.{ts,tsx}'],
    },
    resolve: {
        // Order matters: more-specific subpath aliases come first so the bare
        // package alias does not match longer paths like `.../reactivity`.
        alias: [
            { find: /^@klinechart-quant\/core\/reactivity$/, replacement: `${coreSrc}/reactivity/index.ts` },
            { find: /^@klinechart-quant\/core\/controllers$/, replacement: `${coreSrc}/controllers/index.ts` },
            { find: /^@klinechart-quant\/core$/, replacement: `${coreSrc}/index.ts` },
            { find: /^@\//, replacement: `${repoSrc}/` },
        ],
    },
})
