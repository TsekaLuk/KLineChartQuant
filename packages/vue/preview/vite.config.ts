import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import Icons from 'unplugin-icons/vite'

const decoratorTransform = babel({
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
})

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [
        decoratorTransform,
        vue(),
        Icons({ compiler: 'vue3', autoInstall: true }),
    ],
    resolve: {
        alias: {
            '@klinechart-quant/core': fileURLToPath(
                new URL('../../core/src', import.meta.url),
            ),
        },
    },
})
