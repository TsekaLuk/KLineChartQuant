/** 渲染基准专用 Vite 配置，仅负责加载 bench 页面与项目源码。 */

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

import { createCoreSourceAliases } from '../scripts/core-source-aliases.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const coreSrc = `${root}/packages/core/src`
const scriptChartEntry = `${root}/packages/script-chart/src/index.ts`

export default defineConfig({
  plugins: [babel({
    include: [/\/src\/.*\.tsx?$/], exclude: [/node_modules/],
    babelConfig: { babelrc: false, configFile: false, plugins: [
      ['@babel/plugin-proposal-decorators', { version: '2023-11' }], ['@babel/plugin-transform-typescript'],
    ] },
  })],
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    // script-chart 同样走源码，保证它与页面共用同一份 core 定义仓库。
    alias: [
      ...createCoreSourceAliases(coreSrc),
      { find: /^@363045841yyt\/klinechart-script-chart$/, replacement: scriptChartEntry },
    ],
  },
  build: {
    // 只有图表库对比走生产构建：所有被测库都以发布形态参测，不带开发期检查与警告。
    outDir: 'results/compare-build',
    emptyOutDir: true,
    rollupOptions: {
      input: { compare: fileURLToPath(new URL('compare.html', import.meta.url)) },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
})
