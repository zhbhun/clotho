# Tasks

## 1. Shared contract and settings persistence

- [x] 1.1 In `src/shared/rpc.ts`, add `modelMappings` to `AppPreferences`: optional `haiku` / `sonnet` / `opus` keys, each a `providerId/modelId` string; no new RPC pair (rides `appGetPreferences` / `appSavePreferences`).
- [x] 1.2 In `src/main/claude/settings.ts`, add a `sanitizeModelMappings(value, providers)` (revived from a1b0468^, narrowed to the three roles) and call it from `sanitizeAppPreferences`-time load so dangling mappings are dropped on read; keep the legacy `models` fallback handling untouched.
- [x] 1.3 Extend `cloneSettings` in `settings.ts` so the mappings snapshot is deep-copied like the rest of preferences.
- [x] 1.4 Add `settings.test.ts` cases: valid mapping kept, mapping to deleted provider/model dropped, unknown keys ignored, absent field defaults to `{}`.

## 2. Proxy env injection

- [x] 2.1 In `src/main/claude/model-proxy.ts`, add a `MODEL_ROLE_MAPPING_ENV` constant (`haiku`/`sonnet`/`opus` → `ANTHROPIC_DEFAULT_*_MODEL`), widen `createModelProxy` options and `replaceSettings` to carry `{ providers, modelMappings }` as one snapshot, and in `settingsEnv()` inject each role variable with its resolvable mapping, falling back to the session model when the role is unmapped or unresolvable.
- [x] 2.2 In `settingsEnv()`, always set `ANTHROPIC_DEFAULT_FABLE_MODEL` to `''` (shadow) when no mapping produced it, preserving the 322dc5c behavior.
- [x] 2.3 Update the three `proxy.replaceSettings(...)` call sites in `src/main/claude-service.ts` (and any bootstrap wiring) to pass the mappings snapshot together with providers.

## 3. Proxy and runner tests

- [x] 3.1 In `src/main/claude/model-proxy.test.ts`, replace the "never configures the role-based ANTHROPIC_DEFAULT model env vars" test with: mapped role injected with its `providerId/modelId`; unmapped and unresolvable roles fall back to the session model; fable shadowed; `ANTHROPIC_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL` still pinned to the session model.
- [x] 3.2 Update `runner.test.ts` if its env-assembly expectations touch `settingsEnv` output shape.

## 4. Settings UI

- [x] 4.1 Extend `src/renderer/components/model-configuration/default-model-settings.tsx`: retitle the section to the model-mapping title, add a one-line scope description under the title, add haiku / sonnet / opus rows inside the same card (each reusing the card's `ModelTargetPicker` against models of all configured providers), and restore the title-row set-all action (wand button + model menu from a1b0468^ `FillAllModels`, covering only the three roles — never fable); clearing a picker unmaps the role.
- [x] 4.2 Save role changes via the existing preferences flow (same toast pattern as the default-model row); wire `modelMappings` through the settings store used by `provider-settings.tsx`.
- [x] 4.3 Restore the modelMapping i18n strings from a1b0468^ (`settings.modelMapping.title`, `fillAll`, `fillAllAria`, `role.*`, `notConfigured`, `search`, `empty`, `noModels`) in `src/renderer/i18n/catalogs/settings.ts` — en/zh/zh-TW — plus the new footer hint string.

## 5. Renderer tests and verification

- [x] 5.1 Add a component test: pick a model for haiku, save, and assert the preferences payload carries `modelMappings.haiku`; clear and assert the key is removed.
- [x] 5.2 Run `npm run check` and lint/format changed files; run only the touched test files (`model-proxy.test.ts`, `settings.test.ts`, the new component test, `runner.test.ts` if modified).
- [x] 5.3 Manual verification via `npm run debug` (reuse an existing instance if CDP on 3367 answers): with a haiku mapping set, start a custom-model session, launch a `model: 'haiku'` subagent, and confirm via the proxy/env path that the subagent completes instead of returning the 400 `Model must use providerId/modelId` error; stop the app if it was started for this check.
