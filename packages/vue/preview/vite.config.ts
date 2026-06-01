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

const root = fileURLToPath(new URL('../../..', import.meta.url))

function r(rest: string): string {
    return `${root}/packages/core/src/${rest}`
}

export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [
        decoratorTransform,
        vue(),
        Icons({ compiler: 'vue3', autoInstall: true }),
    ],
    resolve: {
        alias: [
            { find: /^@klinechart-quant\/core\/config$/, replacement: r('config/chartSettings.ts') },
            { find: /^@klinechart-quant\/core\/types\/price$/, replacement: r('types/price.ts') },
            { find: /^@klinechart-quant\/core\/semantic$/, replacement: r('semantic/index.ts') },
            { find: /^@klinechart-quant\/core\/plugin$/, replacement: r('plugin/index.ts') },
            { find: /^@klinechart-quant\/core\/reactivity$/, replacement: r('reactivity/index.ts') },
            { find: /^@klinechart-quant\/core\/controllers$/, replacement: r('controllers/index.ts') },
            { find: /^@klinechart-quant\/core\/engine\/chart$/, replacement: r('engine/chart.ts') },
            { find: /^@klinechart-quant\/core\/engine\/chart-store$/, replacement: r('engine/chart-store.ts') },
            { find: /^@klinechart-quant\/core\/engine\/utils\/zoom$/, replacement: r('engine/utils/zoom.ts') },
            { find: /^@klinechart-quant\/core\/engine\/utils\/klineConfig$/, replacement: r('engine/utils/klineConfig.ts') },
            { find: /^@klinechart-quant\/core\/engine\/renderers\/Indicator(\/.*)?$/, replacement: `${root}/packages/core/src/engine/renderers/Indicator$1` },
            { find: /^@klinechart-quant\/core\/engine\/renderers\/paneTitle$/, replacement: r('engine/renderers/paneTitle.ts') },
            { find: /^@klinechart-quant\/core\/engine\/controller\/interaction$/, replacement: r('engine/controller/interaction.ts') },
            { find: /^@klinechart-quant\/core\/engine\/drawing$/, replacement: r('engine/drawing/index.ts') },
            { find: /^@klinechart-quant\/core$/, replacement: r('index.ts') },
        ],
    },
})
