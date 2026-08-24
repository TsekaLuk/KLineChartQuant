# Agent Live Golden Scenarios

## Goal

Analysts can point the Agent at any mainstream OpenAI-compatible endpoint
(base URL + API key + model), then prove real-model user value with PRD
§12.4 system prompt, prompt-injection defenses, and a live golden-scenario
harness that uses fixture market data plus the configured Provider.

302.ai is one optional preset, not the product Provider.

## User Value

A user who already has an OpenAI, DeepSeek, OpenRouter, Groq, DashScope,
Moonshot, Ollama, 302.ai, or other OpenAI-compatible key can configure it
once and run the same Agent. Live evaluation then answers whether the Agent
does useful chart work, not whether a vendor name is hardcoded.

## Confirmed Facts

- Parent task `08-23-kq-agent-workbench-p0`. Branch `feat/agent-live-scenarios`.
- Pi already talks OpenAI Chat Completions via `createProvider()` /
  `openAICompletionsApi`. The wire format is generic; the product is not.
- Settings already persist `baseUrl` + `modelId` separately from the
  credential. Fresh UI and defaults still force 302.ai:
  - `packages/agent-runtime/src/provider-302ai/types.ts:3-5`
  - `packages/agent-runtime/src/application/agent-application-service.ts:39-43`
  - `packages/vue/src/features/agent/components/AgentSettingsDialog.vue:182`
  - credential path `agent-provider-302ai-credential.json` in
    `packages/desktop-electron/electron/main.ts`
- Archived `08-23-provider-302ai` left other Providers out of scope. This
  task reverses that product decision.
- `normalize302AiBaseUrl` already accepts `http:` and `https:`, so local
  Ollama / LM Studio URLs are valid at the HTTP boundary.
- Live env today is `KQ_302AI_API_KEY` only. A missing key is a zero-request
  skip. That policy stays; the variable name becomes vendor-neutral with a
  deprecated alias.
- Official OpenAI-compatible bases verified 2026-08-24:
  - OpenAI: `https://api.openai.com/v1`
  - DeepSeek: `https://api.deepseek.com` (official docs; `/v1` is a common
    alias)
  - Groq: `https://api.groq.com/openai/v1`
  - OpenRouter: `https://openrouter.ai/api/v1`
  - DashScope CN: `https://dashscope.aliyuncs.com/compatible-mode/v1`
  - DashScope Intl: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
  - Moonshot CN: `https://api.moonshot.cn/v1`
  - Moonshot Intl: `https://api.moonshot.ai/v1`
  - Gemini OpenAI compat: `https://generativelanguage.googleapis.com/v1beta/openai`
  - Ollama: `http://localhost:11434/v1`
  - 302.ai: `https://api.302.ai/v1`
- Decision (2026-08-24): Alpha does not add native Anthropic Messages,
  Google Generative AI, Azure OpenAI, or Bedrock adapters. Gemini is
  supported only through its official OpenAI-compatible endpoint.

## Requirements

### R1. Vendor-Neutral OpenAI-Compatible Provider

- Runtime identity is `openai-compatible`, not `302ai`.
- Required configuration is `baseUrl`, `apiKey`, and `modelId`. No vendor
  SDK, no vendor-specific factory, no hardcoded default host.
- Error copy, UI title, status `providerLabel`, persistence filenames, and
  env vars must not mention a vendor unless the user selected that preset.
- Fresh install: `not-configured`, empty Base URL, empty model. Do not
  prefill `https://api.302.ai/v1`.
- Existing 302.ai settings/credentials on disk must keep working after
  rename (read old `agent-provider-302ai-*.json`, write new generic files).
- Live / E2E env: `KQ_LLM_API_KEY`, `KQ_LLM_BASE_URL`, `KQ_LLM_MODEL`.
  `KQ_302AI_API_KEY` remains a deprecated alias for the key only.

### R2. Mainstream Presets, Not Hardcoded Providers

- Ship a versioned preset catalog that only fills `baseUrl` and a display
  label. Selecting a preset never locks the user out of editing the URL.
- `Custom` is always available and is the default selection on a fresh
  install.
- Alpha preset list (OpenAI-compatible Chat Completions + Bearer only):
  Custom, OpenAI, DeepSeek, OpenRouter, Groq, DashScope CN, DashScope Intl,
  Moonshot CN, Moonshot Intl, Gemini (OpenAI compat), Ollama, 302.ai.
- Presets are convenience data. Adding a new host later is a catalog edit,
  not a new Provider implementation.
- Model IDs still come from the live `/models` catalog or explicit user
  input. Never hardcode a winning model per preset.

### R3. Keep Existing Provider Safety

- Main-only credential, `safeStorage`, three-stage compatibility probe,
  redacted errors, no Faux in production, and fail-closed when unconfigured
  remain unchanged.
- HTTP status mapping stays vendor-neutral.
- Local `http://` presets (Ollama) are allowed; user/password, query, and
  fragment in Base URL remain rejected.

### R4. System Prompt And Injection Defense

- Runtime system prompt states all PRD §12.4 behavior rules and the
  untrusted-content rule from §14.4.
- Deterministic tests prove tool-result injection cannot raise privilege,
  reveal credentials, or skip confirmation.

### R5. Live Golden Scenarios

- Electron E2E can use fixture market data plus the configured real
  Provider when `KQ_LIVE_E2E=1` and `KQ_LLM_API_KEY` (or deprecated alias)
  are set.
- Cover at least: read-only analysis from tool evidence with no chart
  mutation; a write request that reaches a verified post-state.
- Live evaluation stays out of PR CI. Record real model ID, preset/base
  URL host, pass/fail, and failure mode. No secrets in artifacts.

## Acceptance Criteria

- [x] Fresh install shows unconfigured Provider with empty Base URL and
      generic copy. 302.ai appears only as a selectable preset.
- [x] Selecting DeepSeek, Groq, OpenRouter, Ollama, or 302.ai fills that
      preset's official Base URL; the user can still edit it or choose
      Custom and type any `http(s)` URL.
- [x] A successful three-stage test against a non-302 host persists that
      host and model; reopening settings shows the saved Base URL, not
      302.ai.
- [x] Production composition, logs, errors, and package filenames do not
      hardcode `302.ai` / `302ai` except as one preset id, its documented
      URL, a legacy file fallback, and a deprecated env alias.
- [x] Existing 302.ai credential/settings files migrate and remain usable.
- [x] Live harness reads `KQ_LLM_*` (alias `KQ_302AI_API_KEY`); missing key
      is a skip with zero network calls.
- [x] Deterministic prompt-safety tests cover §12.4 rules and injection
      non-escalation.
- [x] Live golden scenarios, when run, report whether the model used tools
      and left the expected chart state — not merely that the IPC path
      returned.

## Out Of Scope

- Native Anthropic Messages, Google Generative AI, Azure OpenAI
  deployments, Bedrock, or any non-OpenAI-compatible wire format.
- Multi-provider routing, fallback, or per-preset extra headers unless a
  listed preset cannot authenticate with Bearer alone.
- Browser-direct Provider clients or storing keys in Web localStorage.
- Putting live model evaluation on the PR CI path.
