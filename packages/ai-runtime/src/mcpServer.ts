import { createMcpToolAdapter, type McpToolAdapter } from './mcpAdapter.js'
import { createMcpProtocol } from './mcpProtocol.js'
import { SessionRegistry } from './sessionRegistry.js'
import type { ToolCapabilityContext, ToolError } from './toolRegistry.js'
import { createWsTransport, WsSessionHandle } from './wsTransport.js'

import type { ControllerDescription } from '@363045841yyt/klinechart-core'
import type { WebSocket } from 'ws'

export interface McpServerOptions {
  serverInfo?: { name?: string; version?: string }
  ws?: { port?: number; host?: string }
  registry?: SessionRegistry
  capability?: Omit<ToolCapabilityContext, 'audience' | 'chartReady'>
}

export interface McpServerInstance {
  server: ReturnType<typeof createMcpProtocol>['server']
  registry: SessionRegistry
  wss: ReturnType<typeof createWsTransport>['wss']
  adapter: McpToolAdapter
  start(): Promise<void>
  stop(): Promise<void>
}

function handleWsConnection(ws: WebSocket, registry: SessionRegistry): void {
  console.error(`[MCP] WS client connected`)
  let handle: WsSessionHandle | null = null

  ws.on('message', (raw: Buffer) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'register') {
      const sessionId = (msg.sessionId as string) ?? globalThis.crypto.randomUUID()
      handle = new WsSessionHandle(sessionId, ws)
      registry.register(sessionId, handle)
      console.error(
        `[MCP] Session registered: ${sessionId} (total=${registry.getActiveSessionIds().length})`,
      )
      ws.send(JSON.stringify({ type: 'registered', sessionId }))
      return
    }

    if (handle) {
      handle.handleMessage(msg)
    }

    if (msg.type === 'state:update' && handle) {
      registry.updateState(
        handle.sessionId,
        msg.descriptions as Record<string, ControllerDescription>,
      )
    }
  })

  ws.on('close', () => {
    if (handle) {
      console.error(`[MCP] Session disconnected: ${handle.sessionId}`)
      registry.unregister(handle.sessionId)
    }
  })

  ws.on('error', () => {
    if (handle) {
      registry.unregister(handle.sessionId)
    }
  })
}

function hostError(code: string, message: string, retryable: boolean): ToolError {
  return { code, message, retryable }
}

export function createMcpServer(options: McpServerOptions = {}): McpServerInstance {
  const registry = options.registry ?? new SessionRegistry()
  const wsPort = options.ws?.port ?? 8081
  const wsHost = options.ws?.host ?? '0.0.0.0'

  const transport = createWsTransport({ port: wsPort, host: wsHost })
  transport.wss.on('connection', (ws) => handleWsConnection(ws, registry))

  const adapter = createMcpToolAdapter({
    capabilityContext: () => ({
      ...options.capability,
      chartReady: registry.getActiveSessionIds().length === 1,
    }),
    async execute(name, input, context) {
      const sessionId = context.identity.sessionId
      const handle = registry.get(sessionId)
      if (!handle) {
        return {
          ok: false,
          error: hostError('TARGET_GONE', 'The selected chart session is no longer active.', true),
        }
      }
      const result = await handle.executeTool({ name, input: input as Record<string, unknown> })
      return result.success
        ? { ok: true, data: result.data ?? {} }
        : {
            ok: false,
            error: hostError(
              'TOOL_EXECUTION_FAILED',
              result.error ?? 'The chart tool failed.',
              false,
            ),
          }
    },
  })

  const protocol = createMcpProtocol({
    serverInfo: options.serverInfo,
    toolCatalog: () => adapter.listTools().tools,
    async handleCallTool(name, args) {
      const sessions = registry.getActiveSessionIds()
      const sessionId = sessions.length === 1 ? sessions[0]! : 'mcp-unrouted'
      const requestId = globalThis.crypto.randomUUID()
      return adapter.callTool(name, args, {
        requestId,
        sessionId,
        runId: `mcp:${requestId}`,
        turnId: requestId,
        toolCallId: requestId,
      })
    },
  })

  return {
    server: protocol.server,
    registry,
    wss: transport.wss,
    adapter,
    start: protocol.start,
    async stop() {
      await protocol.stop()
      await transport.close()
    },
  }
}
