import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  AgentApplicationService,
  AgentToolRuntime,
  InMemoryProviderCredentialStore,
  InMemoryProviderSettingsStore,
  LEGACY_PROVIDER_CREDENTIAL_FILE,
  LEGACY_PROVIDER_SETTINGS_FILE,
  PROVIDER_CREDENTIAL_FILE,
  PROVIDER_SETTINGS_FILE,
  RendererToolProxy,
  createOpenAiCompatibleRuntimeSupport,
  readLiveProviderEnv,
  type RuntimeSupport,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  createNodeRuntimeSessions,
  type NodeRuntimeSessions,
} from '@363045841yyt/klinechart-agent-runtime/node'
import { app, BrowserWindow, safeStorage, shell } from 'electron'

import { registerAgentIpc, type RegisteredAgentIpc } from './agent-ipc'
import { createNavigationPolicy } from './external-navigation'
import { registerIpcHandlers } from './ipc-handlers'
import {
  ElectronProviderSettingsStore,
  ElectronSafeStorageCredentialStore,
} from './provider-storage'

let mainWindow: BrowserWindow | null = null
let nodeRuntime: NodeRuntimeSessions | undefined
let agentIpc: RegisteredAgentIpc | undefined
let agentToolRuntime: AgentToolRuntime | undefined
let shutdownStarted = false
const currentDirectory = dirname(fileURLToPath(import.meta.url))

function createWindow(): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const rendererFile = join(currentDirectory, '../renderer/index.html')
  const applicationUrl = rendererUrl ?? pathToFileURL(rendererFile).toString()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(currentDirectory, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webgl: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  const navigation = createNavigationPolicy({
    openExternal: (url) => void shell.openExternal(url),
    applicationUrl,
    onRejected: (rawUrl, reason) => {
      console.warn(`Blocked external navigation (${reason}):`, rawUrl)
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    navigation.handleWindowOpen(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!navigation.handleWillNavigate(url)) event.preventDefault()
  })

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(rendererFile)
  }
}

/**
 * 选择本次启动使用的 Provider。
 *
 * - 生产构建使用 OpenAI 兼容 Provider，凭据经 safeStorage 加密落盘。
 * - e2e 构建默认使用确定性 Faux Provider。
 * - e2e 构建设置 `KQ_LIVE_E2E` 时改用真实 Provider，与 fixture 行情组合成
 *   「固定数据 + 真实模型」评估环境；凭据只从环境变量读入内存。
 *
 * Faux 的动态 import 位于 `MODE === 'e2e'` 分支内，生产构建下是静态死代码。
 */
async function createRuntimeSupport(userData: string): Promise<RuntimeSupport> {
  if (import.meta.env.MODE === 'e2e') {
    if (!process.env.KQ_LIVE_E2E) {
      const testing = await import('@363045841yyt/klinechart-agent-runtime/testing')
      return testing.createFauxRuntimeSupport()
    }
    const live = readLiveProviderEnv()
    const credentials = new InMemoryProviderCredentialStore({ persistenceMode: 'memory-only' })
    if (live.apiKey) await credentials.write(live.apiKey)
    return createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings: new InMemoryProviderSettingsStore(),
    })
  }
  return createOpenAiCompatibleRuntimeSupport({
    credentials: new ElectronSafeStorageCredentialStore({
      filePath: join(userData, PROVIDER_CREDENTIAL_FILE),
      fallbackFilePath: join(userData, LEGACY_PROVIDER_CREDENTIAL_FILE),
      safeStorage,
    }),
    settings: new ElectronProviderSettingsStore(
      join(userData, PROVIDER_SETTINGS_FILE),
      join(userData, LEGACY_PROVIDER_SETTINGS_FILE),
    ),
  })
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  const userData = app.getPath('userData')
  nodeRuntime = createNodeRuntimeSessions({
    databasePath: join(userData, 'agent-sessions.sqlite'),
    cwd: userData,
  })
  const support = await createRuntimeSupport(userData)
  const rendererProxy = new RendererToolProxy()
  agentToolRuntime = new AgentToolRuntime({ proxy: rendererProxy, sessions: nodeRuntime.sessions })
  const application = new AgentApplicationService({
    sessions: nodeRuntime.sessions,
    createPlan: support.createPlan,
    provider: support.provider,
    toolRuntime: agentToolRuntime,
  })
  await application.initialize()
  agentIpc = registerAgentIpc(application, rendererProxy)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (shutdownStarted) return
  event.preventDefault()
  shutdownStarted = true
  void (async () => {
    await agentIpc?.close()
    await agentToolRuntime?.close()
    await nodeRuntime?.close()
    app.quit()
  })()
})
