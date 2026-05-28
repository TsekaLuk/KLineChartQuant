import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const coreSrc = fileURLToPath(new URL('../core/src', import.meta.url))

export default defineConfig({
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
        ],
    },
})
