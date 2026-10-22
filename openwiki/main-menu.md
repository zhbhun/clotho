---
type: "Platform Integration"
title: "Application Menu and System Integration"
description: "How the native application menu is built and where its accelerators come from, plus the main-process side of dialogs, external links, the task manager, and other small integrations."
tags: ["menu", "dialog", "external-navigation", "task-manager"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-49fdf9f8625101453763713f
    resource: repo://src/main/application-menu.ts
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-371160160bf046594e33e79e
    resource: repo://src/main/context-menu.ts
  - id: openwiki-source-87085a8bffd2fc255c15a3d8
    resource: repo://src/main/dialogs.ts
  - id: openwiki-source-387bd32f09d98cc07ae41ba7
    resource: repo://src/main/external-navigation.ts
  - id: openwiki-source-e6e21b3e4e1c8eace1e8cb61
    resource: repo://src/main/menu-labels.ts
  - id: openwiki-source-5caf0eaa91a5ea78a88b6bce
    resource: repo://src/main/open-link.ts
  - id: openwiki-source-0b49bf41747772ef9a39ac48
    resource: repo://src/main/save-image.ts
  - id: openwiki-source-02abca0c89062a045adc4e10
    resource: repo://src/main/task-manager.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Application Menu and System Integration

This layer owns the native menu ([application-menu.ts](../src/main/application-menu.ts)), the context menu ([context-menu.ts](../src/main/context-menu.ts)), and several small integrations calling Electron/OS APIs directly: native dialogs, external links, image saving, the task manager, and external navigation interception.

## Menu template

`applicationMenuItems(options)` returns the Electron menu template with six top-level menus:

| Menu | Contents |
| --- | --- |
| Clotho | about, quit (displayed under the app name on macOS) |
| File | New Window (pinned `CmdOrCtrl+N`), Close Session |
| Edit | all Electron roles: undo/redo/cut/copy/paste/selectAll |
| View | toggle sidebar, quick panels, project switch, all sessions, sent messages, back/forward |
| Window | minimize, zoom, one checkbox item per open window, plus front on macOS |
| Help | shortcut settings, troubleshooting, task manager; dev adds toggleDevTools |

`menuLabels(language)` pulls copy from [menu-labels.ts](../src/main/menu-labels.ts) for the current language, covering every `AppLanguage` value. The menu language is updated by the renderer via the `applicationMenuSetLanguage` RPC, which then triggers a rebuild.

## Accelerators

`commandMenuItem` is the uniform constructor for command items:

```ts
const bindings = options.commandBindings(commandId)
accelerator: !options.isCaptureActive && bindings.length > 0 ? bindingToAccelerator(bindings[0]) : undefined
click: () => options.actions.dispatchCommand(commandId)
```

`bindingToAccelerator` translates a `ShortcutBinding` into an Electron accelerator string: modifiers map through `ACCELERATOR_MODIFIERS` (`primary` → `CmdOrCtrl`, `ctrl` → `Control`, the rest capitalized) and key names through `ACCELERATOR_KEYS` (`escape`/`esc` → `Esc`, `enter`/`return` → `Return`, arrow keys, etc.); unregistered keys are uppercased.

When `isCaptureActive` is true, every command item's accelerator is stripped — the renderer is recording a shortcut and the menu accelerators would swallow the keystrokes.

## Command dispatch destinations

Menu actions split in two:

- **Handed to the renderer**: command items (in File/View) and Help's shortcut settings, sent via `sendToActiveWindow` as `menuCommandDispatch` or `menuOpenSettings`, executed by the [Shortcut System](./renderer-shortcuts.md).
- **Executed in the main process**: `openNewWindow` (`appWindows.openNewFree()`), `openTroubleshooting` (`shell.openExternal`), `openTaskManager`.

The Edit menu and Window's minimize/zoom/front use Electron roles and need no forwarding.

## Window list and rebuilds

`resolveWindows` generates one item per open window: project windows prefer the project name (`project.name` or the path's basename), falling back to the window title minus the ` — Clotho` suffix; before the renderer loads, the title is still the bare app name, marked with `…`; free windows are numbered `Clotho 1`, `Clotho 2`, in order.

Rebuilds go through `rebuildApplicationMenu`: bump the sequence, resolve the window list asynchronously, and in the callback compare the sequence — stale replies are dropped (see [Main Bootstrap](./main-bootstrap.md)). Window creation/close, shortcut-override changes, language changes, and capture-state changes all trigger it.

## Task manager

`openTaskManager` opens a 480×320 utility window, single-instance — an existing one is focused. The window uses `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and its page is an inline `data:text/html` with no external resources.

Data comes from `app.getAppMetrics()`: pid, type, CPU percent, memory working set (divided by 1024 into MB), sorted by CPU descending. Every 2 seconds `executeJavaScript` calls the page's `window.updateRows(rows)`. Closing the window clears the timer.

## Native dialogs

[dialogs.ts](../src/main/dialogs.ts) keeps a module-level `ownerWindow`. `createAppWindows` calls `setDialogOwnerWindow` when creating the main window, after which `showFolderPicker` / `showFilesPicker` / `saveImage` all use it as parent, making them behaviorally modal. Without a registered owner they degrade to parentless dialogs.

- `showFolderPicker`: single directory selection; cancel returns null.
- `showFilesPicker`: multi-select by default; cancel returns an empty array.
- [save-image.ts](../src/main/save-image.ts)'s `saveImage`: first validates the data URL is base64-shaped, else throws `Unsupported image source`; the save dialog's filter extension comes from the filename, defaulting to `png`; cancel returns `{ path: null }`.

## External and file links

[open-link.ts](../src/main/open-link.ts)'s `resolveLinkTarget` sorts markdown links into three destinations:

- `http:` / `https:` / `mailto:` → hand to the system.
- `file:` URLs or relative paths → the `containedFileTarget` containment check: if `path.relative(projectPath, filePath)` is empty, starts with `..`, or is absolute, it is out of bounds and returns `ignore`. Absolute paths and `../` escapes are rejected because links in a reply must not open arbitrary local files.
- Other protocols, empty strings, bare `#` anchors → `ignore`.

File targets use `showItemInFolder` to **reveal** rather than open: extensions like `.ts` are double-claimed by LaunchServices (TypeScript and MPEG transport streams), so the system default app might be a media player. `pathExists` confirms existence before revealing.

## External navigation interception

[external-navigation.ts](../src/main/external-navigation.ts)'s `resolveNavigationDisposition` is a separate mechanism from the link logic above, targeting the webContents' own navigation:

- Same URL as current → `allow` (a Vite full reload must pass).
- Unparseable as a URL → `block`.
- Dev-server mode, same origin → `block`: other same-origin paths are missed relative markdown links; loading one swaps the app for Vite's SPA fallback, which looks like a full-page refresh.
- `file:` → `block` (after packaging, relative links resolve next to the bundle; meaningless).
- `http:` / `https:` / `mailto:` → `open-external`.
- Everything else → `block`.

`attachExternalNavigation` hooks it into `will-navigate` and `setWindowOpenHandler`: in-window navigation is always blocked, popups always `deny`, and external links go to the caller-provided `openExternal`.

## Context menu

`textEditMenuItems` only returns menu items or undefined; it never shows a menu. Rules: neither editable nor a selection → undefined (silent region); not editable but a selection → copy only; editable → the full undo/redo/cut/copy/paste/selectAll set, each item's enabled state taken from Electron's `editFlags`.

A comment spells out the constraint: Electron reports all context-menu events as handled and never shows a default menu, so silent regions depend entirely on this gate staying closed — once a non-empty menu is returned in a no-selection region, users see menus where none should appear.
