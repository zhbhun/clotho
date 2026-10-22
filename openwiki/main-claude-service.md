---
type: "Service Layer"
title: "Claude Service"
description: "How createClaudeDesktopService, the single facade behind the RPC layer, assembles the modules, plus the model-catalog and provider validation rules."
tags: ["service", "providers", "models", "settings"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-fccbdc214f82218785f1a74f
    resource: repo://src/main/claude-service.ts
  - id: openwiki-source-427e02da00e7a51bdea04796
    resource: repo://src/main/claude/model-catalog.ts
  - id: openwiki-source-50e52a61baa64faa7135da99
    resource: repo://src/main/claude/model-fetch.ts
  - id: openwiki-source-33e7b2053817b4fe83d416b4
    resource: repo://src/main/claude/provider-usage.ts
  - id: openwiki-source-8b001f5b196d3fd20b4f80e7
    resource: repo://src/main/claude/providers.ts
  - id: openwiki-source-955e47bc1faf9dc7b30400b0
    resource: repo://src/main/claude/settings.ts
  - id: openwiki-source-ba9361f46b0c5afd4b445581
    resource: repo://src/shared/provider.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Claude Service

[src/main/claude-service.ts](../src/main/claude-service.ts) exports `createClaudeDesktopService`, the only facade the RPC layer touches: `service.xxx()` appears in every `claude*` handler in bootstrap, and no module outside this file assembles these capabilities directly.

## What it assembles

`createClaudeDesktopService(events, proxy, settingsStore, sessionStore?, sessionHooks?)` returns an object whose members come from four sources:

- **Session query registry**: `createSessionQueryRegistry(events, proxy, { onRecycled, onRuntimeChanged })`, see [Query Runner](./main-query-runner.md). Both `sessionStore` and `sessionHooks` serve only it — the session functions bootstrap passes in (ownership, rebind, flags) and the two broadcast hooks land here.
- **Settings store**: the providers list, default model, and app preferences are all read from `settingsStore.get()`.
- **Workspace modules**: project CRUD, session reads, git, file search, and attachments come from the `./claude/*` modules.
- **Model proxy**: after any provider create/update/delete, `proxy.replaceSettings(next.providers)` hands the proxy the new routing immediately.

Both `sessionStore` and `sessionHooks` are optional. Without `sessionStore`, `listSessions` falls back to `getProjectSessions(params)` without ownership, while `setSessionsArchived` / `setSessionsPinned` / `setSessionsUnread` throw `Session storage is unavailable`.

## Model catalog

`startup` does not return the SDK's startup result directly; it goes through `startupWithProviders`:

```ts
const result = await startup(params)
const settings = settingsStore.get()
const catalog = buildModelCatalog(result.models, settings.providers, result.account)
return { ...result, ...catalog, providers: settings.providers, defaultModel: settings.defaultModel }
```

`buildModelCatalog` in [model-catalog.ts](../src/main/claude/model-catalog.ts) does three things:

- `hasClaudeAuthentication(account)` decides whether the official Claude channel is available — it requires `account.apiProvider === 'firstParty'` and a `tokenSource` or `apiKeySource` that is not `none`. When unauthenticated, the SDK's model list is dropped entirely and only local provider models remain.
- When authenticated, SDK models are uniformly stamped `providerId: 'claude'`, `providerName: 'Claude'`.
- `providersToModelInfos` flattens each provider's models into `ClaudeModelInfo` entries carrying `providerId` / `providerName` / `contextWindow` / `supportsMultimodal`.

The returned `models` order is official Claude first, local providers after. Two booleans come back too: `hasClaudeAuthentication` and `hasConfiguredProviders` (`providers.length > 0`), which the renderer uses to choose between the Claude sign-in flow and the provider-configuration flow.

## Provider validation

Every provider write path goes through `persistProvider(provider, operation)`:

1. `normalizeProvider(value)` — accepts only objects and requires `models` to be an array; per model it normalizes `thinkingLevel` (empty string falls back to `'on'`) and `thinkingPresetId`, and calls `normalizeProviderApiType` to fold unknown apiTypes into `anthropic-messages`. The normalized result must pass the `isProvider` structural check or null is returned.
2. `isProvider`'s hard requirements: `id` matches `PROVIDER_ID_PATTERN` (`/^[a-z0-9][a-z0-9._-]*$/`), `name` / `baseURL` / `authToken` are strings, every model has a non-empty `id`, string `displayName`, positive-integer `contextWindow`; `supportsMultimodal` and `thinkingLevel` type-check when present; `apiType`, when present, is in `['anthropic-messages', 'chat-completions']`.
3. `normalizedProvider.id === 'claude'` throws `Provider ID is reserved: claude` — that id belongs to the official channel.
4. Into `settingsStore.update`: on `create`, an existing id throws `Provider ID already exists: <id>`; on `update`, a missing one throws `Provider not found: <id>`.
5. Either way, the returned settings run through `sanitizeDefaultModel(settings.defaultModel, providers)` — a provider change can invalidate the old `providerId/modelId`.
6. Finally `proxy.replaceSettings(next.providers)`.

`deleteProvider` and `saveDefaultModel` follow the same pattern: update, sanitize `defaultModel`, replaceSettings. `saveDefaultModel` adds a check: if the caller passed a non-empty string but sanitize yields empty, the model does not exist — throw `Invalid default model: <value>`.

`sanitizeDefaultModel` matches the exact `providerId/modelId` concatenation, never fuzzy or partial.

## Session context sampling

`sampleContextUsage` deliberately prefers the resident query:

```ts
const live = await sessionRegistry.sampleContextUsage(params)
if (live !== null || sessionRegistry.hasLiveQuery(params.sessionId ?? '')) return live
return sampleSessionContextUsage(params, proxy)
```

When a resident query exists it owns this Claude session; a one-shot sampler would race it. So when the live sample fails (returns null) it does not fall back to `sampleSessionContextUsage` — it returns null directly.

## File-top re-exports

The top of the file carries a batch of `export { ... } from './claude/...'`: `buildMainChain`, `finalizeChain`, `parseSessionEntries`, `extractSessionMeta`, `fieldFirst`, `fieldLast`, `firstUserPrompt`, `textFromContent`, `findProjectPathFromSessions`. These symbols were once exposed by the `claude-service` unified entry; after moving to finer modules, the re-exports keep existing import paths alive and spare every caller an edit.

## Provider model fetching and usage

`fetchProviderModels` ([model-fetch.ts](../src/main/claude/model-fetch.ts)) tries candidate URLs in order: an explicit `modelsUrl` first; otherwise `<base>/v1/models`, then `<base>/models`, and if the baseURL ends with `/anthropic`, another pair with that segment stripped. The response is parsed in OpenAI shape (`{ data: [{ id }] }` or a bare array). Total failure throws `All candidates failed: ...` carrying each candidate's error.

`getProviderUsage` ([provider-usage.ts](../src/main/claude/provider-usage.ts)) only requests providers whose baseURL matches `PROVIDER_USAGE_URL_PATTERNS` (the check is `isProviderUsageSupported` in [shared/provider.ts](../src/shared/provider.ts)). Errors split in two: transport failures (DNS, timeout, body interruption) throw so callers can retry; deterministic failures (bad key, unknown provider, non-2xx, invalid JSON) resolve to `{ success: false, error }`. Covered providers are Kimi For Coding, Zhipu GLM, MiniMax, DeepSeek, SiliconFlow, and OpenRouter; Volcengine needs AK/SK signing and the remaining presets have no public quota endpoint, so neither is covered.
