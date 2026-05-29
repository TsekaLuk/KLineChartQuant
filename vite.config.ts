import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import babel from 'vite-plugin-babel'
import vueDevTools from 'vite-plugin-vue-devtools'
import dts from 'vite-plugin-dts'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'

// Scoped to the legacy app `src/` only. The pattern previously matched
// ANY path containing `/src/`, which pulled the babel decorator transform
// into every monorepo package's tests (packages/<name>/src/...) and broke
// vitest's TypeScript transform there. The negative-lookahead keeps the
// transform off the monorepo packages.
const decoratorTransform = babel({
  include: [/^(?!.*\/packages\/).*\/src\/.*\.tsx?$/],
  exclude: [/node_modules/, /\/packages\//],
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
  plugins: [
    decoratorTransform,
    vue(),
    vueDevTools(),
    dts({
      insertTypesEntry: true,
      tsconfigPath: './tsconfig.app.json',
    }),
    Components({
      resolvers: [IconsResolver()],
    }),
    Icons({
      compiler: 'vue3',
      autoInstall: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // 让手机/局域网设备可以访问本机 dev server
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/stock': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/public': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },

  build: {
    target: 'esnext',
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'klinechart',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: ['vue', 'ajv'],
      output: {
        globals: { vue: 'Vue', ajv: 'Ajv' },
      },
    },
  },
})