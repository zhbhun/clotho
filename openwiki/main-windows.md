---
type: "Platform Integration"
title: "Windows"
description: "The lifecycle of the two window kinds (free and project), registry invariants, geometry-state persistence, and the window RPC surface."
tags: ["windows", "geometry", "persistence", "registry"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-30dde318e07c6899e3b541e0
    resource: repo://src/main/app-windows.ts
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-1a2887a9f207624189e9c4e4
    resource: repo://src/main/main-view-url.ts
  - id: openwiki-source-75d5f8840cffe5c5d373a45a
    resource: repo://src/main/native-appearance.ts
  - id: openwiki-source-b385e4ad33e4c56c060782a7
    resource: repo://src/main/startup-theme.ts
  - id: openwiki-source-207c91a7995905c257a0c196
    resource: repo://src/main/window-options.ts
  - id: openwiki-source-4fd449ffc917b57f92febbfc
    resource: repo://src/main/window-registry.ts
  - id: openwiki-source-677ae78eb68a8b5e3aa49a5a
    resource: repo://src/main/window-state-tracker.ts
  - id: openwiki-source-f488fb585aa49ed9a956f8f6
    resource: repo://src/main/window-state.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Windows

[app-windows.ts](../src/main/app-windows.ts) owns every `BrowserWindow`: creation, geometry tracking, project-to-window mapping, and each project's persisted workspace. It splits state across two persisted documents — free windows go to `windowsState`, project windows to `projectState` (see [Main Storage](./main-storage.md)).

## Two window kinds

| | Free window (`kind: 'free'`) | Project window (`kind: 'project'`) |
| --- | --- | --- |
| Count | unlimited | at most one per project |
| Persisted in | `storage.json`'s `windowsState` | `storage.json`'s `projectState` (by projectId) |
| Persisted content | geometry + renderer workspace ui | geometry + workspace ui (both live in projectState) |
| After close | restored next launch only if open at quit | disappears when manually closed (unless open at quit) |

A comment spells out the project window's design intent: **its tabs live in projectState, so closing the window does not hand them back to other windows** — reopening the project restores them verbatim.

`StoredFreeWindowState` stores `id`, `kind: 'free'`, and `ui` (geometry + an optional workspace payload); `StoredProjectWindowState` stores only identity (`id`, `kind`, `projectId`) — geometry and ui both live in projectState. `FreeWindowUi`'s geometry fields are written by the tracker and its workspace fields by the renderer, with per-field merge helpers so the two directions never overwrite each other.

## State and validation

`WindowsState = { lastActiveWindow?: string, openedWindows: StoredWindowState[] }`, `ProjectStateRecord = { ui: ProjectWindowState }`, where `ProjectWindowState` is `ProjectUiState` (`sessionIds`, `activeSessionId`) plus geometry fields.

`sanitizeWindowsState` / `sanitizeWindowState` / `sanitizeProjectStates` share one shape check: a rect requires finite x/y/width/height with positive width and height; `sanitizeWindowUi` requires `currentWorkspaceKey` to be a non-empty string, `sessionTabsByWorkspace` a record of string arrays, and `activeSessionByWorkspace` a record of nullable strings — any miss and the payload is dropped.

Note the **failure granularity differs**: if a free entry's ui is not even a `frame` rect, the whole record is discarded; a malformed workspace payload only loses the payload while geometry still restores. Project entries uniformly keep only identity, stripping any extra stored fields.

`sanitizeProjectUi` dedupes `sessionIds` and clears an `activeSessionId` that falls outside the tabs to null — guarding against a dangling active id after a session was deleted post-quit.

## Geometry helpers

All in [window-state.ts](../src/main/window-state.ts), pure functions over `WindowDisplay[]` (the Electron display's `workArea`/`bounds`/`scaleFactor` subset) and the primary display:

- `fitToDisplays`: picks the display with the **largest intersection area** against each display's `workArea`, falling back to the primary; then `fitFrame` squeezes the window into that workArea (size capped, coordinates clamped). A stored coordinate can be invisible after a display was unplugged; this step guarantees it returns to a visible region.
- `resolveFreeWindowState`: takes the free entry `lastActiveWindow` points at, else the first; with neither, creates a new uuid, **centered in the primary work area**, sized 1280×800 capped at 90% of the work area.
- `cascadeFrame`: offsets 40px down-right from the given frame (`CASCADE_OFFSET`), then fitToDisplays. Both new free windows and new project windows use it.
- `newProjectWindowState`: when the project has persisted state, **reuses its geometry** instead of cascading, so a never-moved window returns to where it was created.
- `FALLBACK_FRAME = { x: 120, y: 80, width: 1280, height: 800 }` is the last-resort fallback.
- `updateWindowState`: ignores updates while fullscreen (fullscreen exit restores geometry by itself); while maximized records only `isMaximized`; otherwise records the new frame and clears maximized.

## State tracker

[window-state-tracker.ts](../src/main/window-state-tracker.ts) batches geometry changes to disk:

- Both `move` and `resize` go through `update`; `statesEqual` (id/maximized/rect, field by field) short-circuits no-change calls.
- After a change, `isDirty = true` and a **250ms** debounce timer resets — dragging a window fires hundreds of events, and writing on each is pointless.
- Disk writes serialize through `writeTail`; `flush()` cancels the timer and writes immediately. Quit and manual project-window closes both flush.
- A write failure sets `isDirty` back to true and reports `onError`; the next change retries.

## createAppWindows

`createAppWindows(options)`' responsibilities:

- **Registry**: [window-registry.ts](../src/main/window-registry.ts)'s `createWindowRegistry` enforces invariants: ids must not repeat; a `project` window must carry a projectId that no other window occupies; a `rebind` to a project another window holds fails. A registration failure destroys the window immediately and throws. It also provides `pinnedProjectIds` so the renderer knows which projects are pinned.
- **Creation**: `createWindow(entry)` builds the `BrowserWindow` ([window-options.ts](../src/main/window-options.ts)), registers it, attaches a tracker, samples geometry on `move`/`resize`, points the dialog parent and updates `lastActiveWindow` on `focus`, hands `context-menu` to `textEditMenuItems`, then `loadURL`s (dev server) or `loadFile`s (bundle) per [main-view-url.ts](../src/main/main-view-url.ts)'s target. The window is `show: false` and only shows on `ready-to-show`, maximizing first when needed — avoiding a white-frame flash.
- **Window options**: `titleBarStyle: 'hiddenInset'` with `trafficLightPosition: { x: 13, y: 12 }` (the comment notes x aligns with the native traffic-light inset, y is a macOS-26-tuned centering value); `sandbox: false` is required — the preload must run a generated theme script before first paint; appearance travels to the preload via the `--clotho-appearance=<base64url>` additional argument (base64url survives Chromium command-line parsing).
- **Focus**: `activeWebContents()` takes the focused window, else the last active free window, else the first window — menu commands arrive through this. `bringToFront` restores from minimize before show/focus.
- **Broadcast**: `broadcast(name, payload, except?)` sends to all registered windows, skipping destroyed webContents and the optional sender. Session events and catalog changes travel this way.
- **Restore**: `restoreFreeWindows` sorts `lastActiveWindow` last (so it ends up focused), fitting each via `fitStoredWindow` before creation; with no records it creates one centered. `restoreProjectWindows` checks each project record that the project still exists and is unoccupied, otherwise removing the entry from persisted state; restored windows get a **new id** with the persisted identity record migrated over, so a later close deletes exactly that entry.
- **flushAll**: flushes every tracker; the quit flow calls it.
- **Project mapping**: `openProjectWindow` writes the seed (identity + geometry + ui) **before** creating the window — the comment stresses the seed must be on disk first, because the renderer's first `windowReadProjectState` must find the workspace. `focusProject` brings an existing window forward and can additionally send `windowSelectSession`. `refocus` repoints the current project window at another project: both workspaces swap inside projectState, returning the new project's ui (or `shown-elsewhere`). `closeProjectWindow` deletes the project's persisted state and destroys the window.

### Close semantics

On `close`: project windows `preventDefault()` by default — flush the tracker, then `destroy()`, because their tabs must stay in projectState. Free windows and quitting windows pass through. `closed` cleans three maps, and if a project window was closed manually by the user (`!isQuitting`), its entry is removed from `windowsState` — only project windows still open at quit restore on next launch.

## Window RPC

| RPC | Semantics |
| --- | --- |
| `windowDescribe` | returns the sending window's identity (id/kind/projectId) and `pinnedProjectIds`; unregistered windows throw |
| `windowReadUiState` | valid only for free windows, returns the persisted workspace ui; project windows return `{ ui: undefined }` |
| `windowWriteUiState` | valid only for free windows, `withWindowUiState` merges field by field (geometry kept) |
| `windowReadProjectState` | reads a project's workspace by projectId, null when absent |
| `windowWriteProjectState` | valid only for project windows, `persistProjectUi` overwrites that project's workspace ui |
| `windowOpenProject` | opens/focuses a project window, returns `{ opened }` |
| `windowFocusProject` | focuses an existing project window, returns `{ focused }` |
| `windowRefocus` | repoints this project window at another project, returning `refocused` with ui or `shown-elsewhere` |

Free-window reads/writes go through `stateStore.transform`, project windows through `appWindows.persistProjectUi` — both sides are queued writes passing sanitize first.

## Startup theme

[window-options.ts](../src/main/window-options.ts) only encodes appearance into the additional argument; [startup-theme.ts](../src/main/startup-theme.ts)'s `createStartupThemePreload` generates the script: the preload runs early in the document, resolving `theme === 'system'` to dark/light via `matchMedia` and classing the root element. **The clotho preset writes no inline color variables** — the stylesheet derives the whole scale from anchor colors, and inlining would freeze a pre-upgrade palette; only non-clotho presets write `--primary`/`--background`/`--foreground`. When the document does not exist yet, a `MutationObserver` waits for it.

[native-appearance.ts](../src/main/native-appearance.ts)'s `applyNativeAppearance(theme)` sets `nativeTheme.themeSource` to the app theme so traffic lights, the system menu, and other native controls follow the UI instead of forever tracking the system. Bootstrap calls it at startup and after `appSavePreferences`.
