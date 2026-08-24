import {
  CANONICAL_TOOL_REGISTRY,
  ToolRegistry,
  createToolRegistry,
  defineTool,
  type ToolCapabilityContext,
  type ToolDefinition,
  type ToolError,
  type PostconditionResult,
  type ToolPostconditionContext,
  type ToolValidationIssue,
} from './toolRegistry.js'

export { createToolRegistry, defineTool }

export interface ToolExecutionIdentity extends ToolPostconditionContext {
  requestId: string
  sessionId: string
  runId: string
  turnId: string
  toolCallId: string
}

export interface CanonicalToolCall {
  name: string
  input: unknown
}

export interface ToolResultMeta extends ToolExecutionIdentity {
  toolVersion: string
  registryVersion: string
  durationMs: number
  chartRevisionBefore?: number
  chartRevisionAfter?: number
  dataRevision?: number
  undoToken?: string
  idempotentReplay?: boolean
}

export type CanonicalToolResult<T = unknown> =
  | {
      ok: true
      data: T
      content?: string
      meta: ToolResultMeta
    }
  | {
      ok: false
      error: ToolError
      meta: ToolResultMeta
    }

export interface ToolHostMeta {
  chartRevisionBefore?: number
  chartRevisionAfter?: number
  dataRevision?: number
  undoToken?: string
  idempotentReplay?: boolean
}

export type ToolHostResult =
  | { ok: true; data: unknown; content?: string; meta?: ToolHostMeta }
  | { ok: false; error: ToolError; meta?: ToolHostMeta }

export interface ToolExecutionContext {
  identity: ToolExecutionIdentity
  definition: ToolDefinition
  capabilityContext: ToolCapabilityContext
}

export type ToolHostExecutor = (
  name: string,
  input: unknown,
  context: ToolExecutionContext,
  signal: AbortSignal,
) => Promise<ToolHostResult> | ToolHostResult

export type ToolPolicyDecision = { allowed: true } | { allowed: false; error: ToolError }

export type ToolPolicyEvaluator = (
  definition: ToolDefinition,
  input: unknown,
  context: ToolExecutionContext,
) => Promise<ToolPolicyDecision> | ToolPolicyDecision

export type ToolPostconditionVerifier = (
  name: string,
  input: unknown,
  output: unknown,
  context: ToolExecutionContext,
  signal: AbortSignal,
) => Promise<PostconditionResult> | PostconditionResult

export type ToolReplayDecision =
  { readonly replay: CanonicalToolResult } | { readonly error: ToolError } | undefined

export type ToolReplayResolver = (
  definition: ToolDefinition,
  input: unknown,
  context: ToolExecutionContext,
) => Promise<ToolReplayDecision> | ToolReplayDecision

export interface ExecuteToolOptions {
  registry?: ToolRegistry
  capabilityContext: ToolCapabilityContext
  execute: ToolHostExecutor
  policy?: ToolPolicyEvaluator
  verify?: ToolPostconditionVerifier
  replay?: ToolReplayResolver
  signal?: AbortSignal
  now?: () => number
}

function invalidArguments(issues: readonly ToolValidationIssue[]): ToolError {
  const hasUnknownField = issues.some((issue) => issue.keyword === 'additionalProperties')
  const hasRangeError = issues.some((issue) =>
    ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'].includes(issue.keyword),
  )
  return {
    code: hasUnknownField ? 'UNKNOWN_FIELD' : hasRangeError ? 'OUT_OF_RANGE' : 'INVALID_ARGUMENTS',
    message: 'Tool arguments do not match the canonical input schema.',
    retryable: false,
    issues,
  }
}

function executionError(): ToolError {
  return {
    code: 'TOOL_EXECUTION_FAILED',
    message: 'The tool host failed to execute the request.',
    retryable: true,
  }
}

function abortError(timedOut: boolean): ToolError {
  return timedOut
    ? {
        code: 'TIMEOUT',
        message: 'The tool exceeded its configured execution deadline.',
        retryable: true,
      }
    : {
        code: 'CANCELLED',
        message: 'The tool call was cancelled.',
        retryable: true,
      }
}

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

export async function executeToolAsync(
  call: CanonicalToolCall,
  identity: ToolExecutionIdentity,
  options: ExecuteToolOptions,
): Promise<CanonicalToolResult> {
  const registry = options.registry ?? CANONICAL_TOOL_REGISTRY
  const now = options.now ?? Date.now
  const startedAt = now()
  const definition = registry.find(call.name)
  let hostMeta: ToolHostMeta | undefined

  const meta = (toolVersion = definition?.version ?? 'unknown'): ToolResultMeta =>
    omitUndefined({
      ...identity,
      toolVersion,
      registryVersion: registry.version,
      durationMs: Math.max(0, now() - startedAt),
      ...hostMeta,
    })
  const fail = (error: ToolError): CanonicalToolResult => ({
    ok: false,
    error: omitUndefined(error),
    meta: meta(),
  })

  if (!definition) {
    return fail({
      code: 'UNKNOWN_TOOL',
      message: `Tool "${call.name}" is not registered.`,
      retryable: false,
    })
  }

  const capability = definition.capability(options.capabilityContext)
  if (!capability.available) {
    return fail({
      code: 'TOOL_UNAVAILABLE',
      message: capability.reason ?? 'The tool is unavailable in the active context.',
      retryable: false,
      details: capability.reasonCode ? { reasonCode: capability.reasonCode } : undefined,
    })
  }

  const validatedInput = registry.validateInput(call.name, call.input)
  if (!validatedInput.ok) return fail(invalidArguments(validatedInput.issues))

  const executionContext: ToolExecutionContext = {
    identity,
    definition,
    capabilityContext: options.capabilityContext,
  }
  if (options.replay) {
    try {
      const decision = await options.replay(definition, validatedInput.value, executionContext)
      if (decision && 'replay' in decision) return decision.replay
      if (decision && 'error' in decision) return fail(decision.error)
    } catch {
      return fail({
        code: 'IDEMPOTENCY_LOOKUP_FAILED',
        message: 'The prior tool result could not be checked safely.',
        retryable: true,
      })
    }
  }
  if (options.policy) {
    try {
      const decision = await options.policy(definition, validatedInput.value, executionContext)
      if (!decision.allowed) return fail(decision.error)
    } catch {
      return fail({
        code: 'POLICY_EVALUATION_FAILED',
        message: 'The application policy could not evaluate this tool call.',
        retryable: false,
      })
    }
  }

  if (options.signal?.aborted) return fail(abortError(false))

  const controller = new AbortController()
  let timedOut = false
  const onCallerAbort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', onCallerAbort, { once: true })
  if (options.signal?.aborted) {
    options.signal.removeEventListener('abort', onCallerAbort)
    return fail(abortError(false))
  }
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('tool timeout'))
  }, definition.policy.timeoutMs)

  const aborted = new Promise<{ aborted: true }>((resolve) => {
    if (controller.signal.aborted) resolve({ aborted: true })
    else
      controller.signal.addEventListener('abort', () => resolve({ aborted: true }), { once: true })
  })
  const execution = Promise.resolve()
    .then(() =>
      options.execute(call.name, validatedInput.value, executionContext, controller.signal),
    )
    .then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    )

  try {
    const settled = await Promise.race([execution, aborted])
    if ('aborted' in settled) return fail(abortError(timedOut))
    if ('error' in settled) {
      if (controller.signal.aborted) return fail(abortError(timedOut))
      return fail(executionError())
    }

    hostMeta = settled.result.meta
    if (!settled.result.ok) return fail(settled.result.error)

    const validatedOutput = registry.validateOutput(call.name, settled.result.data)
    if (!validatedOutput.ok) {
      return fail({
        code: 'INVALID_TOOL_OUTPUT',
        message: 'The tool host returned data that violates its canonical output schema.',
        retryable: false,
        issues: validatedOutput.issues,
      })
    }

    const verifiers = [options.verify, definition.verifyPostcondition].filter(
      (verifier): verifier is NonNullable<typeof verifier> => verifier !== undefined,
    )
    type VerificationState =
      { readonly ok: true } | { readonly ok: false; readonly result: CanonicalToolResult }
    let verificationChain = Promise.resolve<VerificationState>({ ok: true })
    for (const verifier of verifiers) {
      verificationChain = verificationChain.then(async (previous) => {
        if (!previous.ok) return previous
        const verification = Promise.resolve()
          .then(() => {
            if (verifier === options.verify) {
              return options.verify!(
                call.name,
                validatedInput.value,
                validatedOutput.value,
                executionContext,
                controller.signal,
              )
            }
            return definition.verifyPostcondition!(
              identity,
              validatedInput.value,
              validatedOutput.value,
            )
          })
          .then(
            (postcondition) => ({ postcondition }),
            () => ({ verificationError: true as const }),
          )
        const verified = await Promise.race([verification, aborted])
        if ('aborted' in verified) {
          return { ok: false, result: fail(abortError(timedOut)) }
        }
        if ('verificationError' in verified) {
          return {
            ok: false,
            result: fail({
              code: 'POSTCONDITION_FAILED',
              message: 'The tool postcondition verifier failed.',
              retryable: true,
            }),
          }
        }
        const { postcondition } = verified
        if (postcondition.ok) return { ok: true }
        return {
          ok: false,
          result: fail({
            code: 'POSTCONDITION_FAILED',
            message:
              postcondition.error?.message ?? 'The tool postcondition could not be verified.',
            retryable: postcondition.error?.retryable ?? false,
            retryAfterMs: postcondition.error?.retryAfterMs,
            issues: postcondition.error?.issues,
            details: postcondition.error?.details,
          }),
        }
      })
    }
    const verificationState = await verificationChain
    if (!verificationState.ok) return verificationState.result

    return {
      ok: true,
      data: validatedOutput.value,
      ...(settled.result.content === undefined ? {} : { content: settled.result.content }),
      meta: meta(),
    }
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onCallerAbort)
  }
}
