---
type: "Reference"
title: "Main Bootstrap"
description: "bootstrap()'s startup order, how IPC handlers are registered, and the before-quit shutdown flow."
tags: ["bootstrap", "lifecycle", "ipc", "shutdown"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-955e47bc1faf9dc7b30400b0
    resource: repo://src/main/claude/settings.ts
  - id: openwiki-source-59702756f24db1bc92667643
    resource: repo://src/main/index.ts
  - id: openwiki-source-c2346fe78f7848cf0b767c81
    resource: repo://src/main/logging/global-errors.ts
  - id: openwiki-source-8d6fd522e44c1c2d3e97b749
    resource: repo://src/main/logging/rpc.ts
  - id: openwiki-source-91625935d15cfb2f643e4696
    resource: repo://src/main/storage.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Main Bootstrap

`bootstrap()` in [src/main/bootstrap.ts](../src/main/bootstrap.ts) is the main process's single assembly point: build logging, read storage, create windows and services, register IPC, restore windows. This page walks through each step in execution order, plus what happens at quit.

The entry is [src/main/index.ts](../src/main/index.ts): `bootstrap()` runs after `app.whenReady()`. On Windows, a hit from `electron-squirrel-startup` quits immediately. On non-darwin platforms closing the last window exits; darwin does not exit and reopens windows via `activate`.

## Startup order

`bootstrap()` wraps the whole process in `try/catch`; a throw at any stage lands in the trailing `handleFatalError('app.startup_failed', caught)`.

1. **Fatal error handler**: `createFatalErrorHandler` builds a handler installed via `installGlobalErrorHandlers`, covering `uncaughtException` and `unhandledRejection`. It acts only once (`isHandling` dedupe): log fatal, race a `timeoutMs: 1_000` wait for the log flush, then `app.exit(1)`.
2. **Logging init**: `resolveAppChannel()` picks the channel — packaged builds default to `stable`, overridable with `CLOTHO_CHANNEL`; dev uses `dev`. Then `initializeLogging({ appVersion, channel, homeDir, runId })`. The test environment (`NODE_ENV === 'test'`) logs to an in-memory sink; dev adds a console sink.
3. **Recoverable storage**: `readStorage()` reads `~/.clotho/storage.json`. Failure is not fatal — log a `storage.read_failed` warning and fall back to `{}`, then `createStorageStore(loadedStorage)`.
4. **Work project registration**: before any project read/write, `ensureWorkProject()` registers the home-mode project for the homedir in the project registry.
5. **Session storage**: `createSessionStorage(path.join(clothoDir(), 'sessions'), projectIdFromPath(os.homedir()))` — the second argument is the home project id, used to attach unowned sessions to the home project.
6. **Main view target**: `getMainViewTarget({ channel, mainDirectory: __dirname, useDevServer, devServerUrl })`. On the dev channel with a live dev server it returns `{ kind: 'dev-server', url }`, otherwise `{ kind: 'bundled', filePath }`. If the dev server is not up yet it retries (default 25 attempts, 200ms apart) before falling back to bundled.
7. **Settings**: on failure `readSettings()` falls back to `defaultSettings()`, and `readSettings` itself is passed as `recover` into `createSettingsStore`. Then `applyNativeAppearance(loadedSettings.appearance.theme)`.
8. **Shortcut overrides**: `createShortcutStore(await readShortcutOverrides())`.
9. **Window manager**: `createAppWindows(...)`, see [Windows](./main-windows.md).
10. **Model proxy**: `createModelProxy({ providers: proxySettings.providers })`. A startup failure rethrows so the fatal handler finishes things — without the proxy, every non-Claude model is dead.
11. **Claude service**: `createClaudeDesktopService(...)`, see [Claude Service](./main-claude-service.md).

## The three stores

| Store | File | Readers |
| --- | --- | --- |
| `stateStore` | [storage.ts](../src/main/storage.ts) | `createAppWindows` (window geometry and free-window ui), the `windowReadUiState` / `windowWriteUiState` handlers |
| `settingsStore` | [claude/settings.ts](../src/main/claude/settings.ts) | `createClaudeDesktopService` (providers, default model, preferences), `createModelProxy` |
| `shortcutStore` | [shortcuts.ts](../src/main/shortcuts.ts) | `resolveCommandBindings` (menu accelerators), the three `shortcut*` RPC handlers |

`stateStore` and `settingsStore` both serialize writes through a `tail` promise, and `get()` returns a `structuredClone` copy, so callers get snapshots and cannot mutate internal state. They differ in update semantics: `update(patch)` is a shallow merge, `transform(transformer)` is read-modify-write for patches that depend on the current document (window-state merging is exactly this). `settingsStore` adds `recover`: if the marker is still set on the first write, it re-reads from disk before merging, recovering the corruption seen at startup, and logs `settings.recovered` on success.

`sessionStorage` does not go through store serialization; it is injected into `createClaudeDesktopService` as five functions: `sessionOwnership`, `sessionRebindProject`, `sessionSetArchived`, `sessionSetPinned`, `sessionSetUnread`, `sessionListFlags`. The service layer therefore never learns the session index's file format.

## IPC registration

`requestHandlers` is an object satisfying `MainRequestHandlers` (mapped from `DesktopRPC['main']['requests']`), each key an RPC method name. It is wrapped by `wrapRequestHandlers`:

```ts
const requestHandlers = wrapRequestHandlers({ ... } satisfies MainRequestHandlers, (method, caught) => {
  // With CLOTHO_DEBUG=1, log to console
  // Otherwise log rpc.failed with only the method and error name
})
```

`wrapRequestHandlers` uses a `Proxy` to intercept property access and replace each function with an async wrapper: on error it first calls `onError` (an `onError` that itself throws is swallowed and does not mask the original failure), then rethrows. It changes no signatures, only adds error reporting.

The registration loop attaches each handler at `ipcMain.handle(REQUEST_CHANNEL_PREFIX + method, ...)` with `REQUEST_CHANNEL_PREFIX = 'clotho:request:'`. Handlers receive `params` plus `event.sender` — methods needing window context (`claudeSessionViewOpened`, `windowReadUiState`, …) look up `appWindows.windowFor(sender)`.

There is also one `ipcMain.on(MESSAGE_CHANNEL_PREFIX + 'appLogBatch', ...)` with `MESSAGE_CHANNEL_PREFIX = 'clotho:message:'`, handing renderer log batches to `recordWebviewLogBatch`.

## Menu rebuilds

`rebuildApplicationMenu` keeps an increasing `menuRebuildSeq`: after the async window-list resolution returns, only the call whose sequence is still current runs `Menu.setApplicationMenu`, preventing stale replies from overwriting newer menus. Window creation/close, shortcut-override changes, and menu language or capture-state changes all trigger it. Menu items have two destinations — `dispatchCommand` and `openShortcutSettings` go to the renderer via `sendToActiveWindow`; `openTroubleshooting`, `openTaskManager`, and `openNewWindow` execute directly in the main process.

## Shutdown flow

In `before-quit`, `event.preventDefault()` blocks the immediate exit and `isStopping` ensures a single pass:

1. `appWindows.setQuitting()` — window closes no longer trigger the close callback.
2. `modelProxy.stop()`.
3. `appWindows.flushAll()` flushes pending window state to disk.
4. `service.closeAllSessionQueries()` — resident session queries hold CLI subprocesses; quitting kills them (running background tasks die with them, by design).

The four run in parallel; `Promise.all(...).finally()` runs `shutdownLogging()` then `app.exit(0)`.

## Window restore

The last two startup steps: `appWindows.restoreFreeWindows()` restores the previous free windows; then `service.listProjects()` yields all project ids for `appWindows.restoreProjectWindows((projectId) => projectIds.has(projectId))` — windows for projects that no longer exist are not restored.
