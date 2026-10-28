# Design

## Context

See proposal.md — Why. Current state: `settingsEnv()` in `src/main/claude/model-proxy.ts` sets only `ANTHROPIC_MODEL` + `CLAUDE_CODE_SUBAGENT_MODEL` for custom-model sessions; role aliases (haiku/sonnet/opus) fall through to the CLI's built-in first-party ids and fail proxy validation. A previous mapping implementation was removed in a1b0468; its sanitization (`sanitizeModelMappings`), env injection, and UI skeleton survive in git history and are the reference implementation.

## Goals / Non-Goals

**Goals:**

- Global, app-level mapping for `haiku`, `sonnet`, `opus`, each pointing at a configured provider model or empty.
- Injection into custom-model session env only when the mapping resolves against live providers.
- Fable role permanently shadowed to an empty value (322dc5c lesson).
- Settings-page UI with three optional pickers sourced from all configured providers.
- Native `claude/` sessions untouched.

**Non-Goals:**

- Per-model or per-provider mapping granularity (explicitly rejected: global only, user decision).
- Mapping for `fable` or the former `subagent`/`fallback` roles. `subagent` is covered by `CLAUDE_CODE_SUBAGENT_MODEL = session model` already; `fallback` was the legacy slot superseded by the default model.
- Tolerating unqualified model ids in the proxy (`claude-haiku-5-5` reaching the proxy stays a 400 — that is the correct failure signal for an unmapped alias).
- Project-level mappings.

## Decisions

### 1. Persist mappings in `AppPreferences`, not alongside providers

`AppPreferences` (in `src/shared/rpc.ts`) gains `modelMappings: { haiku?, sonnet?, opus? }`. It rides the existing `appGetPreferences` / `appSavePreferences` RPC pair — no new IPC. Alternatives considered: extend `ClaudeskSettings` with a new top-level key written via a new RPC (rejected: duplicates the removal-era design and adds an IPC pair for one object); revive the legacy `models` key on settings (rejected: `readSettings` already treats `models` as the legacy fallback source; reusing it would reintroduce ambiguity with migration).

The old `sanitizeModelMappings` shape is revived, narrowed to the three roles, and folded into `sanitizeAppPreferences` so load-time sanitization (drop unresolvable values) happens once, in the same pass as the rest of preferences.

### 2. Inject in `settingsEnv()` at query time, re-read from the settings snapshot

The proxy keeps an immutable snapshot of `{ providers, modelMappings }`; `replaceSettings` is widened from `(providers)` to `(settings: { providers, modelMappings })` and called at the existing call sites in `claude-service.ts` (3 sites) so any preference save refreshes mappings atomically with providers. `settingsEnv(model)` then:

```
for role in [haiku, sonnet, opus]:
    value = (mapping if resolveModel(routes, mapping) else session model)
    env[ANTHROPIC_DEFAULT_<ROLE>_MODEL] = value
env.ANTHROPIC_DEFAULT_FABLE_MODEL = ''   // always shadow
```

The fallback-to-session-model semantics match the UI copy ("留空走默认模型"): an unmapped or unresolvable role runs on the session model, so role-pinned subagents always work on custom-model sessions even with zero mappings configured.

Alternatives considered: resolve aliases inside the proxy server (rewrite `claude-haiku-5-5` to the mapping at request time — rejected: hides CLI semantics, and the CLI would still believe it runs a haiku model, e.g. for context-window heuristics); leave unmapped roles unset (rejected by the user: the CLI then falls back to its built-in first-party id and the proxy 400s — the exact failure this change exists to remove).

### 3. UI: role rows inside the existing default-model card, retitled (user decision, prototype variant B)

The default-model card on the model settings page gains three additional rows — haiku / sonnet / opus — each with the same `ModelTargetPicker` the default-model row already uses, and the card's section title changes from "默认模型" to the model-mapping title (`settings.modelMapping.title`, restored from a1b0468^: "模型映射"). The section title carries a set-all action (wand icon button with a model menu, restoring the a1b0468^ `FillAllModels` pattern minus the removed roles) that assigns one chosen model to all three roles at once; unlike the old implementation it does NOT touch the fable slot (that role is never mapped, so the old silent fable re-enable bug cannot recur). A one-line description directly under the title ("仅自定义模型会话生效；留空走默认模型" / en equivalent) explains the scope; no in-card footer hint. Role labels/descriptions reuse the old i18n strings from a1b0468^ (`settings.modelMapping.role.*` in `src/renderer/i18n/catalogs/settings.ts`). The component `default-model-settings.tsx` is extended rather than a new component being created; options list every configured provider's models; clearing a picker unmaps the role.

### 4. Tests

- `model-proxy.test.ts`: replace the "never configures the role-based ANTHROPIC_DEFAULT model env vars" test with positive cases (mapped role injected, unmapped role absent, unresolvable mapping dropped, fable always shadowed) and keep the `ANTHROPIC_MODEL`/`CLAUDE_CODE_SUBAGENT_MODEL` pinning assertions.
- `settings.test.ts`: sanitization cases (valid mapping kept, dangling mapping dropped, unknown keys ignored).
- Renderer component test for the three pickers: save/clear round-trip through the preferences client mock.

## Risks / Trade-offs

- [All three roles on one model can increase cost/latency vs. the CLI's lightweight-haiku behavior] → Mappings are optional; user picks a cheap model per role if desired.
- [Mapping references a model whose context window differs from the session model] → Accepted: the CLI's own per-role heuristics handle windows; clotho only forwards ids.
- [Stale mapping saved before a provider was deleted] → Load-time sanitization drops it (spec requirement).
- [Future CLI role aliases beyond haiku/sonnet/opus] → New roles need a follow-up; the env map is a single constant, extension is mechanical.

## Migration Plan

Additive change: new optional preference field, no data migration. Existing installs simply have no mappings — behavior identical to today. Rollback = revert the commit; the extra preference key is ignored by older code that does not read it.
