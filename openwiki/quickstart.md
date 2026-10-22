---
type: "Reference"
title: "Quickstart"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-e8625b5b4c5848ac6b0576e3
    resource: repo://forge.config.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-59702756f24db1bc92667643
    resource: repo://src/main/index.ts
  - id: openwiki-source-6be24f8041737febc9c977ca
    resource: repo://src/preload/index.ts
  - id: openwiki-source-204ad0eb4bd56fe46715fe8b
    resource: repo://src/renderer/app.tsx
  - id: openwiki-source-39e18faf4fe62278d38ba627
    resource: repo://src/renderer/main.tsx
  - id: openwiki-source-03e0930002ce569bec464bd0
    resource: repo://src/renderer/services/desktop/client.ts
  - id: openwiki-source-453810c8163ec6595fbf35ab
    resource: repo://src/shared/rpc.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---


# Quickstart

Clotho is a Claude desktop client built with Electron and React: a Node main process owns the Claude Agent SDK and all local state, a React renderer owns the UI, and exactly one typed IPC channel connects them. The one-line description in [package.json](../package.json) says the same, and the [README](../README.md) lead matches it.

If you have five minutes, this page plus the [Overview](./overview.md) is enough to start reading code.

## The one rule that matters

**All cross-process communication goes through [src/shared/rpc.ts](../src/shared/rpc.ts).**

That file defines `DesktopRPC` — about 90 main-process requests, one renderer-to-main fire-and-forget message (`appLogBatch`), and 10 main-process push messages. The renderer never calls `ipcRenderer.invoke` directly; it goes through `requestFromDesktop` in [src/renderer/services/desktop/client.ts](../src/renderer/services/desktop/client.ts), and the main process registers its handlers in [src/main/bootstrap.ts](../src/main/bootstrap.ts). When the contract changes, both ends change together — this is an explicit CLAUDE.md rule.

`DesktopRPC` is asymmetric: `main.requests` is full while `renderer.requests` is empty. The main process never "calls" the renderer; it only pushes. Details in [Shared Contracts](./shared-contracts.md).

## Run it

```bash
npm install        # deps; Forge's Vite plugin builds all three targets at build time
npm start          # Electron Forge + Vite dev server; the main window loads the dev server
```

Debugging adds two ports:

```bash
npm run debug      # electron-forge start -- --remote-debugging-port=3367 --inspect=3368
```

- **3367**: renderer CDP. Check `curl -s http://127.0.0.1:3367/json/version` first for an already-running instance, then drive verification with `Runtime.evaluate`.
- **3368**: main-process inspector.

Project rules forbid Playwright / Chromium / ego-browser, and `npm start` must not be used for verification (it would start another instance); reuse a running one and stop any instance you started.

Types and tests:

```bash
npm run check      # tsc --noEmit (the script is named check, not typecheck)
npm test           # vitest run
npm run lint       # eslint
npm run format     # prettier --write
```

The three Vite build targets (main / preload / renderer) and the external-runtime-package tradeoffs are covered in [Build and Testing](./build-testing.md).

## Read these three files first

| Order | File | What it does |
| --- | --- | --- |
| 1 | [src/main/index.ts](../src/main/index.ts) | The actual Electron entry. 23 lines: the Windows squirrel install/uninstall branch, `app.whenReady().then(() => bootstrap())`, and the macOS behavior of staying alive after the last window closes. All assembly lives in `bootstrap()` |
| 2 | [src/preload/index.ts](../src/preload/index.ts) | The IPC bridge. Defines the `clotho:request:` and `clotho:message:` channel prefixes and exposes `invoke` / `send` / `onPushMessage` as `window.clotho`; it also applies the startup theme before the first paint via the `--clotho-appearance=` argument |
| 3 | [src/renderer/main.tsx](../src/renderer/main.tsx) | The renderer entry. Installs the context-menu gate, error logging, and titlebar double-click at module top; then initializes settings and theme, starts session persistence, registers the one-time `pagehide` flush, initializes i18n, and finally renders the Provider tree |

After those three, read [src/renderer/app.tsx](../src/renderer/app.tsx) (27 lines) — the last provider layer: `ShortcutRuntimeProvider` → `TooltipProvider` → `ShortcutScope scope="workbench"` wrapping `ShortcutHost` and `WorkbenchPage`.

> Note: older revisions of the README's Structure block pointed at `src/main.ts`. The real entry is **`src/main/index.ts`** — [forge.config.ts](../forge.config.ts) declares `entry: 'src/main/index.ts'`, and the built `.vite/build/main.js` is what package.json's `"main"` field points at.

## Page index

### Architecture and startup

- [Overview](./overview.md) — three-process architecture, IPC data flow, technology table.
- [Build and Testing](./build-testing.md) — the three Vite targets, external runtime packages, test layout, and the project's verification workflow.
- [Main Bootstrap](./main-bootstrap.md) — how `bootstrap()` assembles storage, logging, windows, the menu, and the shortcut store.
- [Renderer Bootstrap](./renderer-bootstrap.md) — the provider tree, settings/theme init order, and startup-failure handling.
- [Preload Bridge](./preload.md) — the three `window.clotho` primitives and the startup-theme preload script.
- [Desktop Client](./renderer-desktop-client.md) — the renderer's wrapper over `window.clotho`, plus UI-state reads and writes.

### Main process

- [Claude Service](./main-claude-service.md) — Claude Agent SDK lifecycle and subprocess management.
- [Query Runner](./main-query-runner.md) — a query's full path from request to streamed frames.
- [Session Transcripts](./main-sessions.md) — transcript file IO, history editing, and rollback.
- [Main Storage](./main-storage.md) — atomic writes, tail chains, and project state files.
- [Windows](./main-windows.md) — free vs project windows, the window registry, and UI-state persistence.
- [Workspace and Projects](./main-workspace.md) — the project catalog, git branches, and workspace identity.
- [File Search and Attachments](./main-file-search.md) — the fff file index and attachment handling.
- [Model Proxy](./main-model-proxy.md) — request forwarding for custom providers and usage queries.
- [Application Menu](./main-menu.md) — the native menu, accelerators, system integration, and deep links.
- [Main Logging](./main-logging.md) — main-process logtape config, redaction, and rotation.

### Renderer

- [Workbench Page](./renderer-workbench.md) — page composition, the cross-session zustand store, catalog loading, and the two persistence chains.
- [Session View](./renderer-session.md) — in-session state layering and the controller's stores.
- [Conversation Rendering](./renderer-conversation.md) — the message list, folding logic, and timeline.
- [Prompt Composer](./renderer-composer.md) — the Tiptap editor, attachments, permission modes, and the send flow.
- [Sidebar and Quick Open](./renderer-sidebar.md) — the virtual list, timeline grouping, and quick-open fuzzy search.
- [Tool Renderers](./renderer-tools.md) — the tool-card registry, aliases, MCP fallback, and per-family renderers.
- [Shortcut System](./renderer-shortcuts.md) — the command catalog, key resolution, scope arbitration, and the recorder.
- [Settings Page](./renderer-settings.md) — settings categories, the shortcut table, and preference persistence.
- [Renderer Logging](./renderer-logging.md) — webview-side log collection and batch reporting.

### Shared

- [Shared Contracts](./shared-contracts.md) — the `src/shared` type contracts, request groups, and domain-type highlights.
