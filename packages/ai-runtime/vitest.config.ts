import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

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
