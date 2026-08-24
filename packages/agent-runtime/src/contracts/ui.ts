/** Stable Renderer contract. Pi, Provider, and host transport types stop here. */
import { OPENAI_COMPATIBLE_PROVIDER_LABEL } from './provider-presets.js'

export * from './provider-presets.js'

export const AGENT_UI_PROTOCOL_VERSION = 2 as const

/** 未配置时的中性状态：不预填任何厂商 Base URL。 */
export function unconfiguredProviderStatus(): ProviderStatusView {
  return {
    state: 'not-configured',
    providerLabel: OPENAI_COMPATIBLE_PROVIDER_LABEL,
    configured: false,
    compatibility: 'unknown',
  }
}

export type AgentRunStatus =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial'
  | 'interrupted'

export type AgentMessageStatus = 'streaming' | 'complete' | 'cancelled' | 'failed'
export type ToolCallStatus =
  | 'queued'
  | 'running'
  | 'requires-confirmation'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rejected'
  | 'undone'
export type ToolSafety = 'read-only' | 'reversible-write' | 'destructive'

export interface EvidenceView {
  symbol?: string
  period?: string
  source?: string
  timezone?: string
  range?: string
  returned?: number
}

export interface AgentMessageView {
  id: string
  role: 'user' | 'assistant' | 'action'
  content: string
  createdAt: number
  status?: AgentMessageStatus
  evidence?: EvidenceView
}

export interface ToolProgressView {
  label: string
  current?: number
  total?: number
}

export interface AgentErrorView {
  code: string
  message: string
  retryable: boolean
  recommendedAction?: string
}

export interface ToolCallView {
  id: string
  runId: string
  name: string
  label: string
  status: ToolCallStatus
  inputSummary: string
  resultSummary?: string
  error?: AgentErrorView
  progress?: ToolProgressView
  safety: ToolSafety
  reversible: boolean
  canLocate?: boolean
  startedAt?: number
  finishedAt?: number
  durationMs?: number
  undoToken?: string
  evidence?: EvidenceView
}

export type ToolConfirmationDecision = 'confirmed' | 'rejected' | 'allow-session'
export type ConfirmationStatus = 'pending' | ToolConfirmationDecision | 'expired'
export interface ConfirmationView {
  id: string
  toolCallId: string
  title: string
  description: string
  impact: string
  reversible: boolean
  expiresAt: number
  status: ConfirmationStatus
}

export interface AgentUsageView {
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  durationMs?: number
}

export interface ChartContextView {
  symbol: string | null
  period: string | null
  visibleRange?: string | null
  selectedBar?: string | null
  readOnly: boolean
}

export type ProviderConnectionState = 'not-configured' | 'testing' | 'connected' | 'error'
export type ProviderPersistenceMode = 'encrypted' | 'memory-only'
export type ProviderCompatibility = 'unknown' | 'testing' | 'incompatible' | 'compatible'
export interface ProviderStatusView {
  state: ProviderConnectionState
  providerLabel: string
  configured?: boolean
  baseUrl?: string
  modelId?: string
  modelLabel?: string
  fingerprint?: string
  persistenceMode?: ProviderPersistenceMode
  compatibility?: ProviderCompatibility
  lastTestedAt?: number
  lastModelsRefreshAt?: number
  warning?: string
  error?: AgentErrorView
}

export interface ProviderModelView {
  id: string
  name: string
  compatibility: Exclude<ProviderCompatibility, 'testing'>
  latencyMs?: number
  ttftMs?: number
}

export interface AgentSessionView {
  id: string
  title: string
  updatedAt: number
}

export interface AgentRunView {
  id: string | null
  sessionId: string | null
  status: AgentRunStatus
  startedAt?: number
  endedAt?: number
  usage?: AgentUsageView
  error?: AgentErrorView
}

interface EventEnvelope {
  protocolVersion: typeof AGENT_UI_PROTOCOL_VERSION
  /** Monotonic per-runtime cursor. Fake/browser bridges may omit it. */
  sequence?: number
}

interface RunEventEnvelope extends EventEnvelope {
  runId: string
  sessionId: string
}

export type AgentUiEvent =
  | (RunEventEnvelope & { type: 'run.started'; startedAt: number })
  | (RunEventEnvelope & { type: 'run.cancelling' })
  | (RunEventEnvelope & { type: 'run.cancelled'; partial: boolean; endedAt: number })
  | (RunEventEnvelope & { type: 'run.completed'; endedAt: number; usage?: AgentUsageView })
  | (RunEventEnvelope & { type: 'run.failed'; endedAt: number; error: AgentErrorView })
  | (RunEventEnvelope & { type: 'run.interrupted'; endedAt: number; error: AgentErrorView })
  | (RunEventEnvelope & { type: 'user.message.created'; message: AgentMessageView })
  | (RunEventEnvelope & {
      type: 'assistant.message.started'
      messageId: string
      createdAt: number
    })
  | (RunEventEnvelope & { type: 'assistant.text.delta'; messageId: string; delta: string })
  | (RunEventEnvelope & { type: 'assistant.message.completed'; messageId: string })
  | (RunEventEnvelope & { type: 'assistant.message.failed'; messageId: string })
  | (RunEventEnvelope & { type: 'action.summary'; message: AgentMessageView })
  | (RunEventEnvelope & { type: 'tool.started'; call: ToolCallView })
  | (RunEventEnvelope & {
      type: 'tool.progress'
      toolCallId: string
      progress: ToolProgressView
    })
  | (RunEventEnvelope & { type: 'tool.confirmation.required'; request: ConfirmationView })
  | (RunEventEnvelope & {
      type: 'tool.confirmation.resolved'
      confirmationId: string
      decision: Exclude<ConfirmationStatus, 'pending'>
    })
  | (RunEventEnvelope & { type: 'tool.finished'; result: ToolCallView })
  | (RunEventEnvelope & { type: 'tool.undone'; toolCallId: string; undoneAt: number })
  | (EventEnvelope & { type: 'sessions.changed'; sessions: AgentSessionView[] })
  | (EventEnvelope & { type: 'provider.status.changed'; status: ProviderStatusView })
  | (EventEnvelope & { type: 'chart.context.changed'; context: ChartContextView })

export type AgentUiEventInput = AgentUiEvent extends infer Event
  ? Event extends AgentUiEvent
    ? Omit<Event, 'protocolVersion' | 'sequence'>
    : never
  : never
type AgentRunUiEvent = Extract<AgentUiEvent, { runId: string }>
export type AgentRunUiEventInput = AgentRunUiEvent extends infer Event
  ? Event extends AgentRunUiEvent
    ? Omit<Event, 'protocolVersion' | 'sequence' | 'runId' | 'sessionId'>
    : never
  : never

export interface AgentSessionSnapshot {
  session: AgentSessionView
  messages: AgentMessageView[]
  toolCalls: ToolCallView[]
  runs: AgentRunView[]
  lastSequence: number
}

/** 审计导出结构的版本，独立于会话持久化 schema，便于外部消费方单独迁移。 */
export const KQ_TRACE_EXPORT_VERSION = 1 as const

/**
 * 一次工具调用的审计记录：工具卡片视图提供业务语义，工具结果 meta 提供 toolVersion
 * 与 revision 证据，两者按 toolCallId 合并。
 */
export interface AgentRunTraceToolCall {
  toolCallId: string
  toolName: string
  toolVersion?: string
  status: ToolCallStatus
  safety: ToolSafety
  reversible: boolean
  inputSummary: string
  resultSummary?: string
  error?: AgentErrorView
  startedAt?: number
  finishedAt?: number
  durationMs?: number
  chartRevisionBefore?: number
  chartRevisionAfter?: number
  dataRevision?: number
  undoToken?: string
  idempotentReplay?: boolean
}

/** 按 runId 导出的完整审计包，内容已统一脱敏。 */
export interface AgentRunTraceExport {
  exportVersion: typeof KQ_TRACE_EXPORT_VERSION
  exportedAt: number
  sessionId: string
  runId: string
  turnId: string
  retryOfRunId?: string
  readOnly: boolean
  startedAt: number
  status: AgentRunStatus
  endedAt?: number
  usage?: AgentUsageView
  error?: AgentErrorView
  toolCalls: AgentRunTraceToolCall[]
  events: AgentUiEvent[]
}

export interface StartRunInput {
  sessionId: string
  prompt: string
  readOnly: boolean
}
export interface ProviderTestInput {
  baseUrl: string
  apiKey?: string
  model: string
}
export interface ProviderModelsInput {
  baseUrl: string
  apiKey?: string
}
export interface ProviderModelsResult {
  models: ProviderModelView[]
  refreshedAt: number
}
export interface ProviderProbeStageResult {
  stage: 'catalog' | 'text' | 'tool'
  ok: boolean
  latencyMs: number
  ttftMs?: number
}
export interface ProviderTestResult {
  compatible: boolean
  model: string
  latencyMs: number
  ttftMs?: number
  stages: ProviderProbeStageResult[]
}

export interface AgentBridgeClient {
  listSessions(): Promise<AgentSessionView[]>
  openSession(sessionId: string): Promise<AgentSessionSnapshot>
  getProviderStatus(): Promise<ProviderStatusView>
  createSession(): Promise<AgentSessionView>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  startRun(input: StartRunInput): Promise<{ runId: string }>
  cancelRun(runId: string): Promise<void>
  retryRun(runId: string): Promise<{ runId: string }>
  confirmTool(confirmationId: string, decision: ToolConfirmationDecision): Promise<void>
  undoTurn(runId: string): Promise<void>
  exportRunTrace(runId: string): Promise<AgentRunTraceExport>
  listProviderModels(input: ProviderModelsInput): Promise<ProviderModelsResult>
  testProvider(input: ProviderTestInput): Promise<ProviderTestResult>
  deleteProviderCredential(): Promise<void>
  subscribe(listener: (event: AgentUiEvent) => void): () => void
}
