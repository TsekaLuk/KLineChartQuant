import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import Icons from 'unplugin-icons/vite'

export default defineConfig({
    plugins: [
        vue(),
        Icons({ compiler: 'vue3', autoInstall: true }),
        dts({
            tsconfigPath: fileURLToPath(new URL('./tsconfig.build.json', import.meta.url)),
        }),
    ],

    build: {
        target: 'esnext',
        lib: {
            entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
            name: 'KLineChartVue',
            formats: ['es', 'cjs'],
            fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
        },
        rollupOptions: {
            external: ['vue', /@klinechart-quant\/core/],
            output: {
                globals: { vue: 'Vue' },
            },
        },
    },
})
