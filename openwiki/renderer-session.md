---
type: "Reference"
title: "Session View"
description: "The session view: the controller owning a single session's lifecycle, its stores and services, and the surrounding UI chrome."
tags: ["renderer", "session", "stores", "lifecycle"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-3875fd4b82428e645b6ce6d6
    resource: repo://src/renderer/pages/workbench/session/index.tsx
  - id: openwiki-source-e2012b92758bb80116740e66
    resource: repo://src/renderer/pages/workbench/session/model-onboarding.tsx
  - id: openwiki-source-d524ca05f94a7cff3be1d7ad
    resource: repo://src/renderer/pages/workbench/session/services/composer-service.ts
  - id: openwiki-source-135403198b82f097a9f6b7b4
    resource: repo://src/renderer/pages/workbench/session/services/usage-sampler.ts
  - id: openwiki-source-5ac3adf57429f3062f14b9dd
    resource: repo://src/renderer/pages/workbench/session/session-controller-registry.ts
  - id: openwiki-source-4e739caae23e73c9cceece17
    resource: repo://src/renderer/pages/workbench/session/session-controller.ts
  - id: openwiki-source-fb1481ada98855085443e9e9
    resource: repo://src/renderer/pages/workbench/session/stores/conversation-store.ts
  - id: openwiki-source-cad2f2ea7ee2ca7a228590b2
    resource: repo://src/renderer/pages/workbench/session/stores/model-selection.ts
  - id: openwiki-source-01553b2d77dcf55c37d5fc02
    resource: repo://src/renderer/pages/workbench/session/use-task-progress.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Session View

[pages/workbench/session/](../src/renderer/pages/workbench/session/) is the application's one genuinely working page. It comprises a `SessionController`, seven per-session zustand stores, seven services, and a ring of surrounding UI (tabs, project switcher, branch switcher, subagent progress, task progress).

## Composition

`SessionArea` is the shell, outside-in:

```
SidebarInset
├── ConversationHeader        # tabs, project switcher, branch switcher
├── ErrorBoundary             # resetKeys = [sessionId]
│   └── ModelOnboardingGate   # first-run onboarding (below)
│       └── SessionControllerProvider key={sessionId}
│           └── SessionAreaContent   # conversation + dock + TOC
└── QuickOpenPanel            # quick-open panel
```

`SessionControllerProvider`'s **key is the sessionId** — switching sessions swaps the whole subtree, rebuilding every store and service. Inside, `useState(() => registry.get(options))` fetches (or builds) the controller, and one effect syncs changed outer options via `syncOptions`.

`ModelOnboardingGate` **replaces** the session content wholesale when no model provider is configured (not an overlaid modal); only the mock project skips it.

## SessionController

[session-controller.ts](../src/renderer/pages/workbench/session/session-controller.ts)'s `SessionController` owns all mutable state and side effects for one session. It inherits nothing: construction builds the seven stores, seven services, and a model-configuration store in one pass, and afterwards it exposes only methods.

**Initialization** runs two parallel paths converging in `initialize()`:

- **hydrate**: `persistenceService.load(sessionId)` reads the local session record, restoring the composer draft (prompt, attachments, model selection, permission mode); if the record carries a `claudeSessionId` absent in memory, it fills it and resets `hasLoadedHistory` to false — this session has in fact conversed.
- **history**: `startHistoryLoad()` calls `historyService.load()` to fetch the transcript. The loading state engages only when **there is actually history to fetch**: a brand-new draft has none, and toggling loading would remount the composer between dock and empty state, eating in-flight clicks.

`startCatalogInitialization` first runs `claudeService.startup()` for the command and agent lists, filling the catalog store; the mock project skips it. `initialize()` ends with two things concerning "another window may be running this session": `sessionViewOpened` reports this window is viewing it (blocking idle hot-query recycling), and `attachIfActive` attaches to the live stream when a query is active.

**Send queueing** funnels through `submitAfterHistory`: when history has not finished loading, `isSubmitting` rises first and the real send waits for `startHistoryLoad()` to complete. All three paths — `sendPrompt` / `resumeInterrupted` / `sendPendingMessage` — go through it.

**Runtime changes** arrive via the `claude-session-runtime-changed` push into `sendService.onRuntimeChanged` — another window's rebuild or recycle remounts or resets here. The unsubscribe runs in `dispose`; a listener established after dispose unsubscribes immediately.

**One permission-mode special case**: after forwarding the response, `respondToolRequest` checks whether the answered tool was `ExitPlanMode` with an allow result, and then sets the session's permission mode to `exitPlanTargetMode(loadDefaultPermissionMode())` — when the app default is `plan` it falls back to `default`, otherwise emerging from plan would immediately re-enter plan mode.

**dispose** unsubscribes usage-snapshot and runtime-change listeners, releases the hot query with `sessionViewClosed`, then calls `sendService.dispose()`.

## The seven stores

All use `zustand/vanilla`'s `createStore`, **one set per controller**, never shared or globally persisted:

| store | contents |
| --- | --- |
| `contextStore` | sessionId, claudeSessionId, projectId, projectPath, isHomeMode, isMockProject |
| `composerStore` | prompt, attachments, selected provider/model/agent, permission mode, recalledFromMessage, pendingMessage |
| `conversationStore` | message indexes, tool index, sentTurnIds, interruptedTurnIds/Durations, turnFailures, expandedTurns |
| `runtimeStore` | runtimeStatus, isHistoryLoading, isSubmitting, isStreaming, streamingElapsed, pendingToolRequests, runtimeError, messageEditDraft |
| `usageStore` | context-usage snapshot, isSampling, turn and token accumulation |
| `catalogStore` | available slash commands and agents |
| `modelConfigurationStore` | available models, default model, catalog-loading and SDK-init-complete flags |

**Why per-session**: on tab switch, `key={sessionId}` unmounts and remounts the whole tree; with global stores, two sessions' messages, stream states, and drafts would pollute each other. The [ModelConfigurationStore](../src/renderer/stores/model-configuration-store.ts) is **cross-session shared** — the model catalog is app-level data, one per window suffices, so the registry holds it and injects it into each controller.

`conversationStore` keeps more than a message array — three **indexes**: `messageIds` + `messages` (order-preserving ids and message map), `toolIds` + `tools` (tool blocks merged by toolUseId, so a tool frame-split across one message combines into one item). The selector `selectConversationMessages` reconstructs the array from the indexes. `markSent` / `replaceSentTurn` / `removeSent` track "which turns actually sent" — optimistic cards swap to real messages with new ids, migrated via `replaceSentTurn`. `markStopped` / `clearStopped` / `markFailed` record terminal states.

## The seven services

**`HistoryService`** (see [Conversation Rendering](./renderer-conversation.md)) owns the message ledger: loading, appending frames, frame-coalesced notification, optimistic message replacement.

**`TurnStreamService`** manages the live lifecycle: elapsed timing (200ms ticks), interruption suppression, API-retry deadlines.

**`StreamAssembler`** is the `--output-format stream-json` placeholder-message accumulator, held by HistoryService.

**`SendService`** (1073 lines, the largest) pushes a send toward the main process: build the query, push messages, receive tool requests, respond, stop, interrupt, resume, plus the send state machine (`send-lifecycle`'s idle → awaiting-history → persisted → stop-requested stages).

**`MessageEditService`** handles historical message editing's prepare, rehearsal, and submit (see [Conversation Rendering](./renderer-conversation.md)).

**`UsageSampler`** does on-demand context-usage sampling: with no active query to answer the control request, it **starts a short-lived idle query per sample**, grabs one snapshot, and closes it. `sample()` dedupes — concurrent calls share one sampling query rather than each spawning a CLI. It returns null rather than throwing.

**`ComposerService`** writes every composer change into the local session file. It has a "hidden draft" branch: an un-materialized blank draft stays out of tabs and history until it gains content (or the user leaves, closes the tab, or first sends); once it has content it immediately persists in hidden state, so quitting the app never loses input; clearing the content removes the trace. Most calls are fire-and-forget (one keystroke, one write), so write failures only log `composer.persist_failed`, never becoming unhandled rejections.

`queuePendingMessage` moves the current draft behind the streaming turn and clears the composer (so the stop button returns); `editPendingMessage` moves it back. A pending message is **ephemeral**, living only as long as the controller.

## SessionControllerRegistry

[session-controller-registry.ts](../src/renderer/pages/workbench/session/session-controller-registry.ts) is the **per-window** controller table (`Map<sessionId, SessionController>`), provided by `SessionControllerRegistryProvider`:

- **`get(options)`**: returns after `syncOptions` when present, otherwise builds one injecting the shared modelConfigurationStore.
- **`find(sessionId)`**: read-only lookup; quick-open and navigation use it for unmounted sessions' composer snapshots.
- **`release(sessionId)`**: removes and disposes.
- **`retain(sessionIds)`**: called after tab closes, dropping controllers that lost their tabs — **with the resident-query exception**: it stays registered, the query runs in the background, activity keeps streaming; closing the tab only asks the main process to recycle it when idle, with the `claudeSessionRecycled` push triggering the real release.
- **`dispose()`**: disposes everything on window unmount.

This "closing a tab does not kill the query" design lets turns continue after the tab closes, resumable from elsewhere.

## Surrounding UI

**Tabs** ([session-tabs.tsx](../src/renderer/pages/workbench/session/session-tabs.tsx)): session tabs, closing, and per-session activity indicators.

**Project switcher** ([project-switcher.tsx](../src/renderer/pages/workbench/session/project-switcher.tsx)): the header's project selector, with recent projects and an add-project entry.

**Branch switcher** ([branch-switcher-menu.tsx](../src/renderer/pages/workbench/session/branch-switcher-menu.tsx)): `claudeListProjectGitBranches` / `claudeSwitchProjectGitBranch`, with a new-branch dialog (see [Workspace and Projects](./main-workspace.md)).

**Subagent progress** ([subagent-progress.tsx](../src/renderer/pages/workbench/session/subagent-progress.tsx)): pills for running subagents, clicking into the subagent view.

**Task progress** ([use-task-progress.ts](../src/renderer/pages/workbench/session/use-task-progress.ts) and [task-progress-panel.tsx](../src/renderer/pages/workbench/session/task-progress-panel.tsx)): merges three progress streams into one panel above the dock — the todo list, running subagents, and active workflow groups. **TaskCreate/TaskUpdate states supersede the deprecated TodoWrite trail**, so `latestTodos` prefers taskItems and only falls back to scanning TodoWrite tool calls without them. Cancelled tasks stay out of the count, or the pill would glow forever.

## Model selection

[stores/model-selection.ts](../src/renderer/pages/workbench/session/stores/model-selection.ts)'s `resolveModelSelection` is a **four-level fallback chain**:

1. The session's own selection (chosen in the composer)
2. The project default (`defaultProviderId` / `defaultModelId`, in the project registry)
3. The app-level default (a `providerId/modelId` string)
4. The first available model

Every level passes `isAvailable` validation: while the catalog is loading it counts as available (otherwise nothing selects during startup); the `claude` provider counts as available before SDK init completes; otherwise the model must genuinely exist in `availableModels`.

`useSessionModel` hands the resolution plus display labels to the composer. `qualifiedSessionModel` produces the `provider/model` string for sending and usage sampling.

## Model onboarding

[model-onboarding.tsx](../src/renderer/pages/workbench/session/model-onboarding.tsx) is the two-step first-run flow: create a provider first (default preset `zhipu-glm`), then pick the default model.

Step one's validation: id non-empty, **must not be the reserved `claude`**, must match `PROVIDER_ID_PATTERN`, baseURL and authToken both present, at least one valid model id. On save, the default model becomes that provider's first model.

`pendingModelSaveRef` handles a race: in step two the default model's save is async, and the "done" button must wait for it to land, or the user could leave onboarding with an unsaved default model. The default-model component itself toasts and rolls back on save failure, so this layer does not duplicate that.
