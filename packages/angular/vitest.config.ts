import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        setupFiles: ['./src/__tests__/_setup.ts'],
    },
    // Vitest 4 uses oxc for transforms by default; oxc honours
    // `experimentalDecorators` via the project's tsconfig path. Our
    // packages/angular/tsconfig.json already sets it. No explicit transform
    // override is necessary here.
    resolve: {
        // Order matters: more specific aliases first, otherwise the parent
        // alias matches as a prefix and appends the subpath.
        alias: [
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
        ],
    },
})
