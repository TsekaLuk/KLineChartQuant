import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
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
        ],
    },
})
