import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  AgentApplicationService,
  AgentToolRuntime,
  RendererToolProxy,
  create302AiRuntimeSupport,
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

app.whenReady().then(async () => {
  registerIpcHandlers()
  const userData = app.getPath('userData')
  nodeRuntime = createNodeRuntimeSessions({
    databasePath: join(userData, 'agent-sessions.sqlite'),
    cwd: userData,
  })
  const support: RuntimeSupport =
    import.meta.env.MODE === 'e2e'
      ? (await import('@363045841yyt/klinechart-agent-runtime/testing')).createFauxRuntimeSupport()
      : create302AiRuntimeSupport({
          credentials: new ElectronSafeStorageCredentialStore({
            filePath: join(userData, 'agent-provider-302ai-credential.json'),
            safeStorage,
          }),
          settings: new ElectronProviderSettingsStore(
            join(userData, 'agent-provider-302ai-settings.json'),
          ),
        })
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
