import {
  AGENT_IPC_PROTOCOL_VERSION,
  type RendererToolProxy,
  type AgentApplicationService,
} from '@363045841yyt/klinechart-agent-runtime'
import {
  BrowserWindow,
  ipcMain,
  MessageChannelMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron'

import {
  AGENT_CHART_ID,
  AGENT_COMMAND_CHANNEL,
  AGENT_CONNECT_CHANNEL,
  AGENT_IDENTITY_CHANNEL,
  AGENT_PORT_CHANNEL,
  AGENT_PORT_UI_MESSAGE,
} from './agent-ipc-channels'
import { AgentIpcRouter, type AgentIpcSenderContext } from './agent-ipc-router'
import { ElectronRendererToolTransport } from './renderer-tool-transport'

interface ConnectionIdentity {
  senderId: string
  windowId: string
  chartId: typeof AGENT_CHART_ID
}

function identityFor(
  event: IpcMainEvent | IpcMainInvokeEvent,
): ConnectionIdentity & { isMainFrame: boolean } {
  const window = BrowserWindow.fromWebContents(event.sender)
  return {
    senderId: String(event.sender.id),
    windowId: window ? String(window.id) : '',
    chartId: AGENT_CHART_ID,
    isMainFrame: event.senderFrame === event.sender.mainFrame,
  }
}

function isConnectPayload(value: unknown, identity: ConnectionIdentity): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length === 3 &&
    'protocolVersion' in value &&
    value.protocolVersion === AGENT_IPC_PROTOCOL_VERSION &&
    'windowId' in value &&
    value.windowId === identity.windowId &&
    'chartId' in value &&
    value.chartId === identity.chartId
  )
}

export interface RegisteredAgentIpc {
  close(): Promise<void>
}

export function registerAgentIpc(
  application: AgentApplicationService,
  rendererProxy: RendererToolProxy,
): RegisteredAgentIpc {
  const router = new AgentIpcRouter({ application })
  const generations = new Map<string, number>()
  const connections = new Map<string, { close(interrupt: boolean): void }>()

  ipcMain.on(AGENT_IDENTITY_CHANNEL, (event) => {
    const identity = identityFor(event)
    event.returnValue = identity.isMainFrame
      ? { windowId: identity.windowId, chartId: identity.chartId }
      : null
  })

  ipcMain.handle(AGENT_COMMAND_CHANNEL, async (event, request: unknown) => {
    const identity = identityFor(event)
    const sender: AgentIpcSenderContext = identity
    return router.route(request, sender)
  })

  ipcMain.on(AGENT_CONNECT_CHANNEL, (event, payload: unknown) => {
    const identity = identityFor(event)
    if (!identity.isMainFrame || !isConnectPayload(payload, identity)) return

    connections.get(identity.senderId)?.close(false)
    const { port1, port2 } = new MessageChannelMain()
    const hostGeneration = (generations.get(identity.senderId) ?? 0) + 1
    generations.set(identity.senderId, hostGeneration)
    const target = {
      windowId: identity.windowId,
      chartId: identity.chartId,
      hostGeneration,
    }
    const transport = new ElectronRendererToolTransport({ port: port1, target })
    const detachTransport = rendererProxy.attach(transport)
    let closed = false
    const unsubscribe = application.subscribe((agentEvent) => {
      if (!closed) port1.postMessage({ channel: AGENT_PORT_UI_MESSAGE, event: agentEvent })
    })
    const connection = {
      close(interrupt: boolean): void {
        if (closed) return
        closed = true
        if (connections.get(identity.senderId) === connection) {
          connections.delete(identity.senderId)
        }
        unsubscribe()
        detachTransport()
        router.release(identity.senderId)
        if (interrupt) void application.interruptOwnedRuns()
      },
    }
    connections.set(identity.senderId, connection)
    const cleanup = (): void => {
      if (closed) return
      connection.close(true)
    }
    port1.on('close', cleanup)
    event.sender.once('destroyed', cleanup)
    port1.start()
    event.senderFrame?.postMessage(AGENT_PORT_CHANNEL, { target }, [port2])
  })

  return {
    async close() {
      ipcMain.removeHandler(AGENT_COMMAND_CHANNEL)
      ipcMain.removeAllListeners(AGENT_CONNECT_CHANNEL)
      ipcMain.removeAllListeners(AGENT_IDENTITY_CHANNEL)
      for (const connection of connections.values()) connection.close(false)
      connections.clear()
      generations.clear()
      await application.interruptOwnedRuns()
    },
  }
}
