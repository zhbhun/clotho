# Proposal

## Why

Custom-model sessions (routed through clotho's local model proxy) break whenever a subagent pins a role alias such as `haiku`, `sonnet`, or `opus`. The CLI resolves the alias to its built-in catalog id (e.g. `claude-haiku-5-5`), sends that id to the proxy, and the proxy rejects it with `400 Model must use providerId/modelId`, so the subagent dies with an API error. End-to-end verified: with only `ANTHROPIC_MODEL=zhipu-glm/glm-5.3-flash` set, a `model: 'haiku'` subagent fails every time while the main loop works.

Clotho once had role-based model mappings and removed them in commit a1b0468 ("replace role-based model mappings with a default model"). The removal assumed one default model covers every role; it overlooked that subagent role aliases bypass `ANTHROPIC_MODEL` entirely and fall back to first-party ids.

## What Changes

- Reintroduce a global, app-level role-model mapping for the three safe roles: `haiku`, `sonnet`, `opus`. Each maps to a configured provider model (`providerId/modelId`) or stays empty.
- Inject `ANTHROPIC_DEFAULT_HAIKU_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL` / `ANTHROPIC_DEFAULT_OPUS_MODEL` into the session env only when the mapping resolves against the current providers; unmapped roles stay unset and the session model remains the only model.
- Keep the fable slot permanently shadowed to an empty value (commit 322dc5c: a fable mapping equal to the session model injects a "Claude Fable 5" identity paragraph into the system prompt).
- Restore role pickers in the settings UI: three optional rows (haiku / sonnet / opus) inside the existing default-model card on the model settings page, listing models of all configured providers.
- Persist mappings in app preferences; sanitize on load (drop values that no longer resolve).
- No change for native `claude/` model sessions: they bypass the proxy and the CLI's built-in alias ids already work against the official API.

## Capabilities

### New Capabilities

- `model-role-mapping`: Global role-to-model mapping (haiku/sonnet/opus) applied to custom-model sessions so subagents pinned to role aliases route to configured provider models instead of failing on unresolvable first-party ids.

### Modified Capabilities

(none)

## Impact

- **Shared contract**: `src/shared/rpc.ts` — `AppPreferences` gains `modelMappings`; no new RPC pair needed (persisted via existing `appSavePreferences`).
- **Main process**: `src/main/claude/settings.ts` (sanitize + persist), `src/main/claude/model-proxy.ts` (`settingsEnv` injection, fable shadow), `src/main/claude-service.ts` (snapshot wiring), `src/main/bootstrap.ts` if settings snapshot shape changes.
- **Renderer**: `src/renderer/components/model-configuration/` — new mapping pickers component next to `default-model-settings.tsx`; settings page wiring in `src/renderer/pages/settings/`.
- **Tests**: `src/main/claude/model-proxy.test.ts` (replace the "never configures" assertion with mapping behavior), `settings.test.ts`, renderer component test.
- **Behavior**: only sessions whose model is a custom `providerId/modelId` (proxy path) change; native claude sessions are untouched.
