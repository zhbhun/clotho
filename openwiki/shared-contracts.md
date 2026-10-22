---
type: "Reference"
title: "Shared Contracts"
description: "The type contracts under src/shared: the IPC schema, session and draft records, providers and thinking levels, and domain types shared by both sides."
tags: ["shared", "contracts", "ipc", "types"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-7a968ef60d453bed2d9e7b12
    resource: repo://src/shared/command-catalog.ts
  - id: openwiki-source-d5bdd2ba85d847ef7281925c
    resource: repo://src/shared/logging.ts
  - id: openwiki-source-ba9361f46b0c5afd4b445581
    resource: repo://src/shared/provider.ts
  - id: openwiki-source-f60f5d0d5f56850c4bbd7489
    resource: repo://src/shared/reasoning.ts
  - id: openwiki-source-453810c8163ec6595fbf35ab
    resource: repo://src/shared/rpc.ts
  - id: openwiki-source-5a0d8ba7dfaac941d6344000
    resource: repo://src/shared/session.ts
  - id: openwiki-source-e87341b4874eae35ae4fc6de
    resource: repo://src/shared/shortcuts.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Shared Contracts

[src/shared/](../src/shared/) is the only code the main process and the renderer share. It **contains no implementation** — only types, constants, and pure functions — and both sides compile it, so one change constrains both at once. The CLAUDE.md convention: contracts live here, implementations do not; when a contract changes, both ends change together.

## File responsibilities

| File | Owns |
| --- | --- |
| `rpc.ts` | the IPC schema (`DesktopRPC`) and nearly all domain types |
| `session.ts` | session inputs, local session files, the draft index, session index entries |
| `provider.ts` | provider id / api type / thinking level constants and validation, the usage whitelist |
| `reasoning.ts` | the thinking preset table and its bidirectional mappings |
| `shortcuts.ts` | shortcut bindings, command definitions, scope types and constants |
| `command-catalog.ts` | the single command inventory (data) |
| `logging.ts` | the wire formats for log entries and batches |

`rpc.ts` **re-exports** the types of `session.ts`, `provider.ts`, and `shortcuts.ts` at its end, so the renderer mostly imports from `rpc.ts` or `services/claude/claude.ts`.

## RPCSchemaSide and DesktopRPC

```ts
export type RPCSchemaSide<Config extends {
  requests: Record<string, { params: unknown; response: unknown }>
  messages: Record<string, unknown>
}> = Config
```

This generic **performs no transformation — it is an identity**. Its job is giving the schema a literal-type context so the `params` and `response` spellings get checked: write `claudeStartup: { params: ClaudeStartupParams; response: ClaudeInitializationResult }` and a missing field or mismatched type fails at compile time.

`DesktopRPC` has two sides:

```ts
export type DesktopRPC = {
  main: RPCSchemaSide<{ requests: { ...about 90 }; messages: { appLogBatch: WebviewLogBatch } }>
  renderer: RPCSchemaSide<{ requests: Record<string, never>; messages: { ...10 } }>
}
```

- **`main.requests`**: renderer calls main. About 90 requests, each with params and response types.
- **`main.messages`**: renderer **one-way sends** to main. Only one, `appLogBatch` — logs are high-frequency, returnless, and lossy, so they take send rather than invoke.
- **`renderer.requests`**: empty. The main process never makes "requests" of the renderer; everything arrives as pushes.
- **`renderer.messages`**: the 10 messages main pushes to the renderer.

The asymmetry is the design: **only one side can initiate requests**. The renderer is the sole active party; main can only notify one-way. Neither side can therefore end up in a circular wait.

Consumption is covered in [Preload Bridge](./preload.md) and [Desktop Client](./renderer-desktop-client.md): preload types the three originals of `window.clotho`, and `requestFromDesktop(method, params)` takes its param and return types from `DesktopRPC['main']['requests'][typeof method]`.

## Renderer push messages

| Message | Payload | Purpose |
| --- | --- | --- |
| `claudeOutput` | `{streamId, message: SDKMessage}` | one frame of a session query |
| `claudeError` | `{streamId, message, stack?}` | the query errored |
| `claudeComplete` | `{streamId, success}` | the query finished |
| `claudeToolRequest` | `{streamId, request}` | a pending tool request (permission or question) |
| `claudeSessionRecycled` | `{sessionId}` | an idle query was recycled; the stream is about to end |
| `claudeSessionRuntimeChanged` | `{sessionId, streamId, turnInFlight, pendingToolRequestIds}` | the query's live shape changed; viewers remount or reset |
| `menuCommandDispatch` | `{commandId}` | a menu item fired a command |
| `menuOpenSettings` | `{category}` | the menu asks to open a settings category |
| `windowRegistryChanged` | `{pinnedProjectIds}` | the set of projects shown in project windows changed |
| `windowSelectSession` | `{sessionId, claudeSessionId}` | another window selected a session of this window's project |
| `catalogChanged` | `{}` | the project catalog changed; reload |

The first four all carry `streamId` — a long-lived session query is shared by multiple windows, so frames must route to the right subscriber. The last seven are window-level or app-level broadcasts, independent of any query.

`ClaudeSessionRuntimeChanged`'s `streamId` may be null: null expresses that the query is gone (recycled, rebuilt, or ended).

## Request groups

Grouped by prefix, each group mapping to one main-process module. Representative signatures below, not the full list.

### claude*: session queries and SDK lifecycle

```
claudeStartup(ClaudeStartupParams) → ClaudeInitializationResult
claudeQueryControl(ClaudeQueryControlParams) → unknown
claudeSessionQueryEnsure(ClaudeSessionQueryEnsureParams) → ClaudeSessionQueryEnsureResult
claudeSessionQueryPush(ClaudeSessionQueryPushParams) → void
claudeSessionQueryRebuild(ClaudeSessionQueryRebuildParams) → ClaudeSessionQueryEnsureResult
claudeSessionQueryAttach(ClaudeSessionQueryAttachParams) → ClaudeSessionQueryEnsureResult | null
claudeSessionQuerySetModel(...) → { applied: true } | { applied: false; reason }
claudeSessionViewOpened / Closed(ClaudeSessionQueryAttachParams) → void
claudeSessionQueryRecycleCheck(...) → { recycled: boolean; busy: string[] }
claudeRespondToolRequest(ClaudeStreamToolResponse) → void
```

`ClaudeSessionQueryEnsureResult` carries a `replay: SDKMessage[]` — on remount the main process hands back its cached frames, so a window attaching mid-flight sees the existing turns first, then the live stream. `Attach`'s comment is explicit that it **never creates a query**; without one it returns null.

`ClaudeSessionRuntimeChanged` and `ClaudeSessionStreamState` describe the same query from two angles: the former is the change notification, the latter the snapshot at attach (`status: 'starting' | 'ready' | 'dead'`, `turnInFlight`, `pendingToolRequests`, `backgroundTaskIds`, the current model and agent).

`ClaudeToolRequest` has two kinds: `ask` (AskUserQuestion, replacing the floating form above the composer) and `permission` (a tool requesting authorization, shown as buttons on the card). `ClaudeToolResult` doubles as the SDK's PermissionResult: `allow` may carry `updatedInput` to inject data, `deny` carries a reason.

### claude*: projects, session lists, and transcripts

```
claudeListProjects() → ClaudeProject[]
claudeAddProjectFromFolder / claudeSelectProjectFolder / claudeCreateProject / claudeUpdateProject / claudeRemoveProject
claudeListSessions({ projectId }) → ClaudeSession[]
claudeGetSessionMessages({ projectId, sessionId }) → ClaudeMessage[]
claudeGetProjectGitBranch({ projectPath }) → string | null
claudeListProjectGitBranches({ projectId }) → GitBranchRef[]
claudeSwitchProjectGitBranch({ projectId, branch }) → GitBranchSwitchResult
claudeSetSessionsArchived / claudeSetSessionsPinned / claudeSetSessionsUnread → void
claudeRenameSession / claudeDeleteSession / claudeForkSession
claudeGetSessionEditAnchor(...) → { strategy: 'fresh' } | { strategy: 'resume'; resumeSessionAt }
claudeRewindSessionFiles(ClaudeRewindSessionFilesParams) → ClaudeRewindFilesResult
claudeDropTrailingTurn(ClaudeDropTrailingTurnParams) → { dropped, removedSession }
claudeSampleContextUsage(...) → ClaudeContextUsageSnapshot
```

Three history-editing requests deserve note: `GetSessionEditAnchor` decides "where to restart from" (fresh, or resumed from a given message); `RewindSessionFiles` supports `dryRun` (returning `filesChanged`, `insertions`, `deletions` without touching anything); `DropTrailingTurn` carries an `allowLaterConversation` switch — history editing deliberately discards all later turns, so it skips the "update the conversation" refusal, while recall does not.

`ClaudeDropTrailingTurnParams.sessionId` is optional; without it the project's transcript directory is scanned by uuid.

### window*: window identity and UI state

```
windowDescribe() → WindowDescription
windowReadUiState() → { ui?: WorkbenchWindowUiState }
windowWriteUiState({ ui: WorkbenchWindowUiState }) → void
windowWriteProjectState({ ui: ProjectUiState }) → void
windowReadProjectState({ projectId }) → { ui: ProjectUiState } | null
windowOpenProject({ projectId, ui? }) → { opened: boolean }
windowFocusProject({ projectId, session? }) → { focused: boolean }
windowRefocus({ projectId, ui }) → WindowRefocusResult
windowToggleMaximize() → void
```

The three UI payload types:

```ts
type WorkspaceKey = 'claude' | `project:${string}`

interface WorkbenchWindowUiState {        // free window: the whole window
  currentWorkspaceKey: WorkspaceKey
  sessionTabsByWorkspace: Record<string, string[]>
  activeSessionByWorkspace: Record<string, string | null>
}

interface ProjectUiState {               // one project workspace
  sessionIds: string[]
  activeSessionId: string | null
}
```

`WindowDescription` tells the renderer "which window you are in, whether it is a project window, which projects are pinned" — it decides what the catalog loads and where UI state is written (see [Workbench Page](./renderer-workbench.md)).

`windowOpenProject` with `ui` is a **pop-up window** (seeding a workspace from elsewhere); without it, the project's persisted state is restored. When an existing window already shows the project, no new window opens — the existing one comes to the front. `windowRefocus` rebinds a project window to a different project: the argument is the caller's state for the current project, the return is the new project's state.

### session*: local session records

```
sessionListDrafts() → DraftSessionIndex
sessionRead({ sessionId }) → LocalSession | null
sessionWrite({ sessionId, session }) → void
sessionUpdateDraft({ sessionId, draft }) → void
sessionCompleteDraft({ sessionId }) → void
sessionBindOwner({ sessionId, claudeSessionId, projectId }) → void
sessionDelete({ sessionId }) → void
sessionDeleteProject({ projectId }) → void
```

This group is the RPC surface of the **renderer's local persistence** (main only writes to disk; see [Main Storage](./main-storage.md)). It corresponds to [session.ts](../src/shared/session.ts):

- **`SessionInput`**: the composer's persisted form — prompt, attachments, `model` (a `provider/model` string), permission mode, agent, `recalledFromMessage` (which user turn's input was recalled into this composer).
- **`LocalSession`**: one session file's content. `id` is optional — old files lack the field, and readers fall back to the filename.
- **`DraftSession` / `DraftSessionIndex`**: draft index entries — title, timestamps, project, `pinnedAt` (present means pinned).
- **`SessionIndexEntry`**: one line per session in `sessions/index.json`. Its comment explains the dual identity: **a session starts as a draft, and after starting a slim record remains**, so the index also carries the "session → project entry" ownership — the very reason a directory's "folder" and "workspace" forms keep separate histories. An archived flag may sit on a marker entry with no session file.
- **`SessionListFlags`**: list state (archived, pinned, unread), gathered by the main process from the index per claudeSessionId and merged into the listed sessions.

### app*: app preferences and menu

```
appGetPreferences() → AppPreferences
appSavePreferences(AppPreferences) → AppPreferences
appOpenLink({ href, projectPath }) → { opened: boolean }
applicationMenuSetLanguage({ language }) → void
applicationMenuSetCaptureActive({ active }) → void
```

`AppPreferences` has four fields: `language` (14 languages or follow-system), `defaultPermissionMode`, `archiveInactiveSessions` (0/1/2/7/14 days; 0 means off), and `appearance` (theme, pointer cursor, reduced motion, light and dark palettes).

`applicationMenuSetCaptureActive` is the shortcut recorder's seam: when the renderer begins recording it tells the main process to detach the menu accelerators, otherwise the menu swallows the keys (see [Shortcut System](./renderer-shortcuts.md)).

### shortcut*: shortcut overrides

```
shortcutGetOverrides() → ShortcutOverrides
shortcutSetOverride({ commandId, bindings }) → ShortcutOverrides
shortcutResetOverride({ commandId }) → ShortcutOverrides
```

All three return the **full overrides**, not just the changed entry — the renderer's store swaps its snapshot directly. Writes trigger a menu rebuild on the main side, so the menu's shortcut text updates in step.

### provider* (under the claude prefix)

```
claudeListProviders() → ModelProvider[]
claudeGetDefaultModel() → string | null      // providerId/modelId
claudeCreateProvider({ provider }) → ModelProvider
claudeUpdateProvider({ provider }) → ModelProvider
claudeDeleteProvider({ id }) → void
claudeSaveDefaultModel({ defaultModel }) → string | null
claudeSetProjectModel({ projectId, providerId, modelId }) → void
claudeFetchProviderModels(FetchProviderModelsParams) → string[]
claudeGetProviderUsage(GetProviderUsageParams) → ProviderUsageQuota
```

`ProviderModel` carries two thinking-related fields: `thinkingLevel` (the model's native level) and `thinkingPresetId` (pointing at a preset in [reasoning.ts](../src/shared/reasoning.ts)). The comment explains: without a presetId, `thinkingLevel` is pinned unconditionally; with one, the preset supplies the selectable levels and the mapping.

`ProviderUsageWindow` aligns via `name` with an i18n key (`fiveHour`, `weekly`, `monthly`, `balance`); `utilization` and `remaining` are either-or — percentage windows and balance windows are two shapes.

## Domain type highlights

### Shortcuts

[shortcuts.ts](../src/shared/shortcuts.ts) defines:

- `ShortcutBinding { modifiers, key }` with five modifiers: `primary`, `ctrl`, `alt`, `shift`, `meta`. **`primary` is platform-dependent** — meta on macOS, ctrl elsewhere — so the catalog is written once.
- `ANY_SHORTCUT_SCOPE = '*'`: a command's declared scope may be a single id, `'*'`, or an array of both.
- `CommandDefinition { title, description?, scope, defaultBindings, allowInEditable?, allowRepeat? }`.
- `SHORTCUT_MODIFIER_KEYS` is the 17 key names that "pressed alone are not a shortcut" (alt, capslock, control, fn, meta, numlock, os, scrolllock, shift, super, symbol…); pressing one during recording returns wait.

[command-catalog.ts](../src/shared/command-catalog.ts) is the single data source: about 30 commands, all in the `workbench` scope, ending with two `Object.fromEntries` batches generating the nine tab slots and the nine sidebar slots. The main process reads the same catalog to build menu accelerators.

### Provider constants

[provider.ts](../src/shared/provider.ts):

- `PROVIDER_ID_PATTERN`: `^[a-z0-9][a-z0-9._-]*$`
- `PROVIDER_API_TYPES`: `anthropic-messages` and `chat-completions`, defaulting to the former
- `PROVIDER_MODEL_REASONING_LEVELS`: `none`, `low`, `medium`, `high`, `xhigh`, `max`
- `PROVIDER_USAGE_URL_PATTERNS`: nine baseURL fragments known to have usage endpoints (kimi, bigmodel, z.ai, minimax, deepseek, siliconflow, openrouter). The comment is explicit that this is a **whitelist**: non-matching providers are never probed, and it must stay in sync with the query implementation in `src/main/claude/provider-usage.ts`.

### Thinking levels

[reasoning.ts](../src/shared/reasoning.ts) (521 lines) is the preset table shared by the renderer's dropdown and the model proxy. The file-header comment notes two deliberate departures from ZCode: gpt-family models send a bare `reasoning_effort` on the chat upstream, and unknown models send `thinking.type: enabled` rather than `adaptive` on the anthropic upstream (for compatibility with older gateways).

A `ReasoningPreset` holds an optional list of model levels, a default level, and two functions — `anthropicParams(level)` and `chatParams(level)` — returning the parameters the respective upstream API actually receives.

Matching order in `matchReasoningPreset`: **by model-id pattern first** (an aggregator's provider id may not match, but the family-appropriate preset is still found), then by provider pattern, finally falling back to `generic` (a pure on/off switch).

`claudeLevelFor` / `modelLevelFor` are the two mappings: model level → Claude effort, and back. An unavailable level falls back to the preset's default.

### Logging

[logging.ts](../src/shared/logging.ts) is types only: `AppLogLevel` (debug/error/fatal/info/warning), `WebviewLogEntry` (level, logger, event, message, context, error), `WebviewLogBatch`. `SerializedLogError` carries `componentStack` — a React ErrorBoundary's componentStack can therefore reach the logs (see [Renderer Logging](./renderer-logging.md)).
