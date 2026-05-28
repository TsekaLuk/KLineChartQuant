import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The createChartController bridge imports the legacy engine at
// `../../../../src/core/chart.ts`. That module uses `@/...` aliases for its
// own internal imports, which vitest cannot resolve without help — so we
// mirror the root `vite.config.ts` alias here. This is test-only: production
// builds will inline the engine or apply an equivalent path map.
const repoSrc = fileURLToPath(new URL('../../src', import.meta.url))

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: [{ find: /^@\//, replacement: `${repoSrc}/` }],
    },
})
