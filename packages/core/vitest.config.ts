import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import babel from 'vite-plugin-babel'

// The createChartController bridge imports the legacy engine at
// `../../../../src/core/chart.ts`. That module and its transitive dependencies
// use `@/...` aliases and `@Indicator()` decorators — so we mirror the root
// vite.config.ts alias + babel transform here.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    plugins: [
        babel({
            include: [/\/src\/.*\.tsx?$/],
            exclude: [/node_modules/],
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
        alias: [{ find: /^@\//, replacement: `${repoSrc}/` }],
    },
})
