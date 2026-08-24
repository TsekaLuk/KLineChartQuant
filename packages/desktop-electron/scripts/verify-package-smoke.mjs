// 打包产物冒烟检查：确认生产构建包含真实入口、加载了外链白名单，且没有把 E2E 专用的
// faux Provider 或开发期源码别名带进发布包。在 CI 的 agent-package-smoke job 中作为硬门禁运行。

import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outDirectory = join(packageRoot, 'out')

const REQUIRED_ENTRIES = [
  'main/main.js',
  'main/migrations/001_initial.sql',
  'preload/preload.cjs',
  'renderer/index.html',
]

// 这些标记只应出现在 E2E 构建或开发环境里，出现在生产包中即视为构建配置回退。
const FORBIDDEN_IN_MAIN = [
  { marker: 'createFauxRuntimeSupport', reason: 'the E2E faux Provider leaked into production' },
  { marker: 'ELECTRON_RENDERER_URL=', reason: 'a dev renderer origin was inlined' },
]

// 这些标记证明加固后的策略确实进入了产物，而不是只存在于源码里。
const REQUIRED_IN_MAIN = [
  { marker: 'EXTERNAL_LINK_ALLOWED_HOSTS', reason: 'the external link allowlist is missing' },
  { marker: 'will-navigate', reason: 'the navigation guard is missing' },
]

const failures = []

async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

for (const entry of REQUIRED_ENTRIES) {
  const path = join(outDirectory, entry)
  const stats = await stat(path).catch(() => undefined)
  if (!stats?.isFile() || stats.size === 0) failures.push(`Missing or empty build output: ${entry}`)
}

const mainBundle = await readIfPresent(join(outDirectory, 'main/main.js'))
if (mainBundle === undefined) {
  failures.push('Could not read out/main/main.js; run `electron-vite build` first.')
} else {
  for (const { marker, reason } of FORBIDDEN_IN_MAIN) {
    if (mainBundle.includes(marker)) failures.push(`${reason} (found "${marker}").`)
  }
  for (const { marker, reason } of REQUIRED_IN_MAIN) {
    if (!mainBundle.includes(marker)) failures.push(`${reason} (expected "${marker}").`)
  }
}

const preloadBundle = await readIfPresent(join(outDirectory, 'preload/preload.cjs'))
if (preloadBundle === undefined) {
  failures.push('Could not read out/preload/preload.cjs; run `electron-vite build` first.')
} else if (!preloadBundle.includes('exposeInMainWorld')) {
  failures.push('The preload bundle does not expose the context bridge.')
}

if (failures.length > 0) {
  console.error('Package smoke failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Package smoke passed: ${REQUIRED_ENTRIES.length} entries verified.`)
}
