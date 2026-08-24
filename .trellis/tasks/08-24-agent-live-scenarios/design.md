# Design: Vendor-Neutral Provider + Live Scenarios

## Boundaries

One OpenAI-compatible runtime stays in `packages/agent-runtime`. Electron Main
owns credentials, HTTP, and persistence. Vue owns the shared settings dialog
and only receives `ProviderStatusView` / model / test views.

There is no Provider plugin interface and no per-vendor factory. A preset is
a `{ id, label, baseUrl, aliases? }` row that fills the Base URL field.

```
Settings UI  --(baseUrl, apiKey, model)-->  IPC  -->  OpenAI-compatible runtime
Preset catalog (data) ---- fills baseUrl ----^
Legacy 302.ai files ---- read fallback ---- persistence
```

## Contracts

- Runtime id: `openai-compatible`. Display label comes from the matched
  preset, or `OpenAI-compatible` when the URL is custom / empty.
- Settings schema stays version 1. No new required fields. Preset identity
  is derived by normalizing `baseUrl` and matching the catalog, including
  documented aliases (DeepSeek `/v1`).
- Persistence writes only:
  - `agent-provider-credential.json`
  - `agent-provider-settings.json`
- Persistence reads those first, then falls back to
  `agent-provider-302ai-credential.json` /
  `agent-provider-302ai-settings.json`. Delete removes both generations.
- Live env resolution is centralized:
  - key: `KQ_LLM_API_KEY` or deprecated `KQ_302AI_API_KEY`
  - url: `KQ_LLM_BASE_URL`
  - model: `KQ_LLM_MODEL`
- Empty `baseUrl` is invalid for catalog/test/run. Unconfigured status
  omits `baseUrl` instead of inventing a host.

## Compatibility

- Existing 302.ai installs keep working through the legacy file fallback.
- `KQ_302AI_API_KEY` remains accepted so current live scripts and CI secrets
  do not break.
- External-navigation allowlist may still include `302.ai` as a docs host;
  that is unrelated to the runtime Provider identity.
- Faux E2E may still use a 302.ai URL as fixture data. Production defaults
  must not.

## Tradeoffs

- OpenAI-compatible only: covers the mainstream hosts the user asked for,
  without a second streaming/tool-call stack.
- Presets as data: adding SiliconFlow later is a catalog edit, not a new
  module.
- No extra headers in Alpha: OpenRouter optional `HTTP-Referer` is not
  required for auth; Anthropic native headers are out of scope.

## Rollback

- Revert the branch. Legacy 302.ai files are never deleted on write, so an
  older build can still read them.
- Live evaluation remains opt-in and outside `agent-ci.yml`.
