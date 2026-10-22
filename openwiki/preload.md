---
type: "Reference"
title: "Preload Bridge"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-30dde318e07c6899e3b541e0
    resource: repo://src/main/app-windows.ts
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-b385e4ad33e4c56c060782a7
    resource: repo://src/main/startup-theme.ts
  - id: openwiki-source-207c91a7995905c257a0c196
    resource: repo://src/main/window-options.ts
  - id: openwiki-source-6be24f8041737febc9c977ca
    resource: repo://src/preload/index.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---


# Preload Bridge

[src/preload/index.ts](../src/preload/index.ts) is the only contact surface between the renderer and the main process. It does two things: apply the startup theme before any page script runs, and expose `window.clotho` via `contextBridge`.

## Channel prefixes

The whole IPC has exactly two string constants, and they are **duplicated on the main-process side** rather than shared:

```ts
const REQUEST_CHANNEL_PREFIX = 'clotho:request:'
const MESSAGE_CHANNEL_PREFIX = 'clotho:message:'
```

[bootstrap.ts](../src/main/bootstrap.ts) and [app-windows.ts](../src/main/app-windows.ts) each keep their own copy. This is intentional: no shared module exists between preload and the main process to host these constants, and putting them in `src/shared/` would add a dependency layer to the preload. The two conventions therefore hold only by naming discipline — changing one without the other surfaces as renderer calls silently hanging (an `invoke` with no matching handler rejects outright).

The request channel `clotho:request:<method>` uses `ipcMain.handle` (can return values); the message channel `clotho:message:<name>` uses `ipcRenderer.send` and `webContents.send` (one-way, no return). Bootstrap registers every method of the `requestHandlers` object as `ipcMain.handle(prefix + method)`, plus one `ipcMain.on(prefix + 'appLogBatch')` dedicated to renderer log batches.

## The exposed surface

```ts
contextBridge.exposeInMainWorld('clotho', {
  invoke(method, params) { return ipcRenderer.invoke(REQUEST_CHANNEL_PREFIX + method, params) },
  send(method, payload) { ipcRenderer.send(MESSAGE_CHANNEL_PREFIX + method, payload) },
  onPushMessage(name, handler) {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on(MESSAGE_CHANNEL_PREFIX + name, listener)
    return () => { ipcRenderer.removeListener(MESSAGE_CHANNEL_PREFIX + name, listener) }
  },
})
```

All three methods are **untyped** (`string` / `unknown`). Type safety is not established at this layer but in the renderer's [Desktop Client](./renderer-desktop-client.md), which maps `DesktopRPC`'s ([src/shared/rpc.ts](../src/shared/rpc.ts)) method names and param types onto these three primitives.

`onPushMessage` returns an unsubscribe function instead of asking callers to keep the listener reference — renderer hooks therefore `return unsubscribe()` straight from effect cleanup. Handlers receive the payload with the event object stripped: the renderer never needs `IpcRendererEvent`.

## The startup theme

At the top of the preload (before `exposeInMainWorld`), theme bootstrapping runs:

1. Find the `--clotho-appearance=` argument in `process.argv`.
2. `decodeStartupAppearanceArgument` (base64url → JSON) decodes it into `AppAppearancePreferences`.
3. `new Function(createStartupThemePreload(appearance))()` executes the generated theme script.

The main process passes the argument via `additionalArguments` when creating the window (see [Windows](./main-windows.md)). base64url is required: raw JSON's quotes and spaces cannot survive Chromium's command-line parsing.

The theme script itself ([startup-theme.ts](../src/main/startup-theme.ts)) resolves `theme === 'system'` to dark/light with `matchMedia('(prefers-color-scheme: dark)')` and classes `document.documentElement`; only non-clotho presets write the `--primary` / `--background` / `--foreground` inline variables — the clotho preset's colors derive from the stylesheet, and inlining would freeze a pre-upgrade palette. When the document does not exist yet, a `MutationObserver` waits for it.

Why in the preload: windows are created `show: false` and only shown on `ready-to-show`. If the theme waited for React to mount, the first frame would be an unthemed default color — a visible white/black flash.

## Why the preload imports from src/main

```ts
import { createStartupThemePreload } from '../main/startup-theme'
import { decodeStartupAppearanceArgument } from '../main/window-options'
```

The preload builds into the **same bundle** as the main process and runs in the same isolated context — it is not a third process. Keeping these two functions in `src/main/` means the theme generation and encoding logic has one implementation, and the tests (`startup-theme.test.ts`, `window-options.test.ts`) directly cover the code the preload actually executes.

This does not contradict AGENTS.md's "src/main must not depend on the renderer or shadcn": that rule governs the main process never depending downward on the frontend, whereas here the preload (the bridge layer) reuses the main process's pure functions upward. The reverse never happens — `src/main/` never imports `src/preload/`; main-side window creation only passes the appearance argument down.

## Correspondence with the main process

| preload | main process |
| --- | --- |
| `invoke(method, params)` | `wrapRequestHandlers`-wrapped `ipcMain.handle('clotho:request:' + method)` |
| `send('appLogBatch', payload)` | `ipcMain.on('clotho:message:appLogBatch')` → `recordWebviewLogBatch` |
| `onPushMessage(name)` | `webContents.send('clotho:message:' + name, payload)` |

Renderer logs are the only channel using `send`: high-frequency, no return, loss-tolerant. All other pushes (session output, errors, completion, tool requests, catalog changes) originate from the main process.
