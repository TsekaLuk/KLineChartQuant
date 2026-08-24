import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import type { CanonicalMcpCallResult, CanonicalMcpTool } from './mcpAdapter.js'

type ToolResponseContent = { type: 'text'; text: string }

export interface McpProtocolOptions {
  serverInfo?: { name?: string; version?: string }
  toolCatalog: () => readonly CanonicalMcpTool[]
  handleCallTool: (name: string, args: Record<string, unknown>) => Promise<CanonicalMcpCallResult>
}

export interface McpProtocol {
  server: Server
  start(): Promise<void>
  stop(): Promise<void>
}

export function createMcpProtocol(opts: McpProtocolOptions): McpProtocol {
  const server = new Server(
    {
      name: opts.serverInfo?.name ?? 'klinechart-ai-mcp',
      version: opts.serverInfo?.version ?? '0.0.0',
    },
    {
      capabilities: { tools: {} },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: opts.toolCatalog().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
      annotations: t.annotations,
    })),
  }))

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
      const result = await opts.handleCallTool(request.params.name, request.params.arguments ?? {})
      return {
        content: [...result.content] as ToolResponseContent[],
        structuredContent: result.structuredContent as unknown as Record<string, unknown>,
        isError: result.isError,
      }
    },
  )

  async function start(): Promise<void> {
    const transport = new StdioServerTransport()
    await server.connect(transport)
  }

  async function stop(): Promise<void> {
    await server.close()
  }

  return { server, start, stop }
}
