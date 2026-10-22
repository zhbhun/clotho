---
type: "Reference"
title: "Desktop Client"
description: "The renderer-side bridge layer: typed request and event wrappers, the claude facade, and the renderer's own local persistence."
tags: ["renderer", "ipc", "services", "settings"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-caabaef23a036bb1c36740f3
    resource: repo://src/renderer/components/resizable-sidebar.tsx
  - id: openwiki-source-edf2af132d74c1801f2fcec0
    resource: repo://src/renderer/services/app-settings.ts
  - id: openwiki-source-6b133f97c7ad8c951c42bffa
    resource: repo://src/renderer/services/claude/claude.ts
  - id: openwiki-source-fcd49f7a086b08d40a9f11e3
    resource: repo://src/renderer/services/claude/model-settings.ts
  - id: openwiki-source-03e0930002ce569bec464bd0
    resource: repo://src/renderer/services/desktop/client.ts
  - id: openwiki-source-06f894cc856c2c39e1626ffd
    resource: repo://src/renderer/services/ui-storage.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Desktop Client

This layer is the renderer's only entry point to the main process. [src/preload/index.ts](../src/preload/index.ts) exposes just three untyped primitives as `window.clotho`; [services/desktop/client.ts](../src/renderer/services/desktop/client.ts) wraps them into typed requests/events; [services/claude/claude.ts](../src/renderer/services/claude/claude.ts) layers a domain-grouped `claude` facade on top.

## IPC wrapping

The `DesktopBridge` interface mirrors the preload's three methods: `invoke` (requests that return values), `send` (one-way, no return), `onPushMessage` (push subscription, returning an unsubscribe). A missing bridge on window means undefined — that is the "non-desktop runtime" test.

Three exported functions are **the renderer's only permitted IPC entries**:

- **`requestFromDesktop(method, params)`**: generics take the method's params and response types from `DesktopRPC['main']['requests']`; without a bridge it throws `The Clotho desktop bridge is unavailable`.
- **`sendMessageToDesktop(method, payload)`**: only for high-frequency, discardable pushes like renderer log batches; silently no-ops without a bridge.
- **`listenDesktopEvent(eventName, handler)`**: returns an unsubscribe function.
- **`isDesktopRuntime()`**: whether the bridge exists.

Push event names use the renderer's own kebab-case (`claude-output`, `claude-tool-request`, `window-registry-changed`…), and the `PUSH_EVENT_BINDINGS` table maps them to the main process's camelCase message names (`claudeOutput`, `claudeToolRequest`, `windowRegistryChanged`…). Each push subscribes exactly once, at module top, dispatching frames in place to the `Set` of handlers — subscribers do business only, never touching IPC.

`DesktopEventMap` pins each event's payload type to `DesktopRPC`, so adding a push means changing three places together: the main process's send, `PUSH_EVENT_BINDINGS`, and `DesktopEventMap`.

## The claude facade

[services/claude/claude.ts](../src/renderer/services/claude/claude.ts) exports a `claude` object of about sixty methods, **each corresponding to one RPC request**, named one-to-one with the main-process handlers (`claudeStartup`, `claudeListProjects`, `claudeGetSessionMessages`…). Most of the file is re-exporting type aliases from `src/shared/rpc.ts` — the `ClaudeMessage`, `ClaudeSession`, and `ClaudeToolRequest` imported across the renderer are aliases of the shared contract, never a second set.

On non-desktop runtimes each method has its own fallback: lists return `[]`, nullable values return `null`, writes silently return, and genuinely impossible operations throw (`Project management is only available in the desktop app`, `Session branching requires the desktop runtime`). The test is uniformly `isTauriRuntime()` — a legacy name that just means `isDesktopRuntime()`.

**Mock injection** rides `import.meta.env.DEV`: `listProjects`, `getProjectSessions`, `loadSessionHistory`, `listSubagents`, `getSubagentMessages`, `getWorkflowRuns`, and the git branch queries check the [mock directory](../src/renderer/services/claude/mock/index.ts) first in DEV, serving fake data on a `MOCK_PROJECT_ID` hit. The UI can thus be developed in a browser without Electron.

### Session streams

`claude.openSessionStream` / `rebuildSessionStream` / `attachSessionStream` return a `ClaudeSessionStream` — an `AsyncGenerator<SDKMessage>` built by `createSessionStream`. It wraps the main process's resident session query as a generator:

- **`AsyncQueue`** is the buffering core: a frame arriving with no waiting `next()` enqueues; with one, it delivers directly. `fail` / `finish` close the queue.
- **Frames before attach are not lost**: events can arrive before the ensure reply (carrying streamId); a `buffered` array holds them and flushes once attach lands.
- **`applyFrameState`** derives stream state from frames: a `result` frame sets `turnInFlight` false, `user` / `assistant` / `stream_event` set it true, and `system/init` lands `claudeSessionId` pushing state to `ready`.
- **Replay**: at attach the main process returns the session's cached frames, enqueued before the buffered flush — a window joining mid-session sees existing turns first, then goes live.
- **Tool requests pending at attach** re-deliver to the handler — they still owe an answer.
- Control-plane methods (`interrupt`, `setPermissionMode`, `setModel`, `getContextUsage`, `stopTask`…) uniformly go through `claudeQueryControl` with just streamId, command name, and params; sending messages uses `claudeSessionQueryPush`, answering tool requests uses `claudeRespondToolRequest`.
- `detach()` unsubscribes everything, clears handlers, and ends the queue but **never touches the main process's query** — closing one viewing window does not affect another window's running turn. `whenAttached()` resolves false when attach fails, letting view-only callers back out.

A comment marks the difference from ordinary per-send queries: a `result` frame ends the turn, not the stream; the stream ends only when the query dies or the consumer detaches.

## App settings

[services/app-settings.ts](../src/renderer/services/app-settings.ts)'s `createAppSettingsService(client)` is a **write-behind store with rollback**. Persistence does not live in the renderer — it delegates to the main process via the `appGetPreferences` / `appSavePreferences` RPCs (see [Main Storage](./main-storage.md)); the renderer caches the values it read.

`AppPreferences` has four top-level fields: `language`, `defaultPermissionMode`, `archiveInactiveSessions`, `appearance` (theme / pointerCursor / reducedMotion / dark and light themePalettes). Each field has its own legal value set and default; `sanitizePreferences` runs after both read and save — any illegal field falls back to default rather than leaving bad data in memory.

The service keeps three states internally: `current` (in memory), `confirmed` (confirmed on disk), `dirtyFields` (fields awaiting write). `persist(field)` only adds to the dirty set and triggers one merged write; `mergeDirtyFields` overlays the dirty fields onto `confirmed`, so one save may carry other concurrently changed fields. A save failure rolls `current` back to `confirmed` and rethrows; callers (theme, language) each toast and restore UI state. `flush()` waits until the write queue and dirty fields are both empty — the `pagehide` flush chain calls it (see [Renderer Bootstrap](./renderer-bootstrap.md)).

`desktopSettingsClient` is the non-desktop fallback: `load` returns default preferences, `save` returns input unchanged, no IPC issued. `initializeAppSettings(client)` can swap the whole client, letting tests inject fakes.

## Model settings

[model-settings.ts](../src/renderer/services/claude/model-settings.ts) holds just two functions: `fetchModelSettings` fetches `listProviders` and `getDefaultModel` in parallel, and `loadModelSettings` pushes the result into the `ModelConfigurationStore`. The provider list and default model are stored separately — the default model is app-level (see [Main Storage](./main-storage.md)), while project-level default models live in the project registry (see [Workspace and Projects](./main-workspace.md)).

## The renderer's own persistence

[services/ui-storage.ts](../src/renderer/services/ui-storage.ts) is the small slice of state that skips the main process entirely. One key, `clotho-ui:v1`, holding a flat JSON object, with three functions: `readUiState` (bad data returns `{}`), `replaceUiState` (full overwrite; write failures stay silent — the comment notes UI restore is best-effort and must never make the app unusable), and `updateUiState` (read-modify-write merging one patch).

Storage is injectable: default `window.localStorage`, falling back to a module-level `memoryStorage` when unavailable (no window, or blocked by browser policy).

What lives here is **per-window UI state** the main process's window state cannot manage at that granularity: currently only the sidebar width ([resizable-sidebar.tsx](../src/renderer/components/resizable-sidebar.tsx)'s `sidebarWidth`). By contrast, session catalogs, tabs, and workspace ui all use the main process's persistence (`windowReadUiState` / `windowWriteUiState` / `windowReadProjectState`, see [Windows](./main-windows.md)) — those must survive across windows and restarts.
