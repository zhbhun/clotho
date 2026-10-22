---
type: "Reference"
title: "Overview"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-5e206b2ebe8d95b2e4896f2b
    resource: repo://src/main/claude/project-file-search.ts
  - id: openwiki-source-59702756f24db1bc92667643
    resource: repo://src/main/index.ts
  - id: openwiki-source-207c91a7995905c257a0c196
    resource: repo://src/main/window-options.ts
  - id: openwiki-source-6be24f8041737febc9c977ca
    resource: repo://src/preload/index.ts
  - id: openwiki-source-204ad0eb4bd56fe46715fe8b
    resource: repo://src/renderer/app.tsx
  - id: openwiki-source-39e18faf4fe62278d38ba627
    resource: repo://src/renderer/main.tsx
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---


# Overview

Clotho is a Claude desktop client built with Electron: a Node main process owns the Claude Agent SDK and all local state, a React renderer owns the UI, and exactly one typed IPC channel connects them.

## Three-process architecture

```
┌─────────────────────┐        clotho:request:<method>         ┌──────────────────────┐
│  React renderer      │  ───────────────────────────────────▶ │  Node main process   │
│  (React 19 + Vite)  │  ipcMain.handle / wrapRequestHandlers │  (Electron main)     │
│                     │ ◀───────────────────────────────────  │                      │
│  window.clotho      │        clotho:message:<name>           │  bootstrap()         │
└─────────────────────┘        webContents.send                └──────────────────────┘
          ▲                                                                │
          │ contextBridge                                                  │ spawn
          │                                                                ▼
          └──────────────── preload (src/preload/index.ts)      Claude Agent SDK / CLI subprocess
```

- **Main process** ([src/main/](../src/main/)): windows, menu, storage, logging, the local model proxy, and the Claude Agent SDK lifecycle. The [index.ts](../src/main/index.ts) entry only runs `app.whenReady()` → `bootstrap()`; all assembly lives in [bootstrap.ts](../src/main/bootstrap.ts).
- **Preload** ([src/preload/index.ts](../src/preload/index.ts)): exposes `window.clotho` to the renderer and applies the startup theme before the first paint.
- **Renderer** ([src/renderer/](../src/renderer/)): React 19 + Tailwind 4; [main.tsx](../src/renderer/main.tsx) assembles the providers and [app.tsx](../src/renderer/app.tsx) renders the [WorkbenchPage](../src/renderer/pages/workbench/index.tsx).

## IPC data flow

The contract lives entirely in [src/shared/rpc.ts](../src/shared/rpc.ts): `DesktopRPC` describes each method's params and return type, and `RPCSchemaSide` separates the request side from the message side. Two channels:

- **Requests**: the renderer calls `window.clotho.invoke(method, params)` → `ipcRenderer.invoke('clotho:request:' + method)` → main-process `ipcMain.handle`. Bootstrap wraps every handler with `wrapRequestHandlers`, which logs `rpc.failed` on error.
- **Pushes**: the main process calls `webContents.send('clotho:message:' + name, payload)` → the renderer's `window.clotho.onPushMessage(name, handler)`. Session output, errors, completion, tool requests, and catalog changes all travel this way.

The renderer never touches `ipcRenderer` directly: [services/desktop/client.ts](../src/renderer/services/desktop/client.ts) wraps `window.clotho` with `requestFromDesktop` and push subscriptions. When the contract changes, both ends change together.

## Technology and versions

From [package.json](../package.json):

| Layer | Technology |
| --- | --- |
| Runtime | Electron 44, Node (main process) |
| Build | Electron Forge 7 (Vite plugin), Vite 8, TypeScript 6 |
| Frontend | React 19, Tailwind CSS 4, shadcn (`base-mira`, Base UI), Lucide React |
| State | zustand 5 |
| Editor | Tiptap 3 (composer) |
| Virtualization | TanStack Virtual 3 |
| Logging | logtape 2 (with file and redaction plugins) |
| Claude | `@anthropic-ai/claude-agent-sdk` |
| File indexing | fff (`@ff-labs/fff-node`, darwin-arm64 binary as optional dependency) |
| Testing | Vitest 5 + React Testing Library 16 + jsdom 30 |
| Quality | ESLint 9, Prettier 3 |

## Directory boundaries

[AGENTS.md](../AGENTS.md) (CLAUDE.md is a symlink to it in this repo) sets three hard boundaries:

- `src/shared/` holds **shared contracts only** — no frontend or backend implementation.
- `src/main/` may depend on `src/shared/` but **never on the renderer or shadcn**.
- Page-private code stays in `src/renderer/pages/<page>/`; promote to a root shared directory only after multiple pages reuse it.

Inside the renderer, use relative paths; across modules, use aliases: `@/shadcn/*` → `src/shadcn/*`, `@/shared/*` → `src/shared/*`.

## Where to start reading

In dependency order:

1. [Shared Contracts](./shared-contracts.md) — the types and RPC contract both ends compile against.
2. [Preload Bridge](./preload.md) — the layer the renderer actually sees.
3. [Main Bootstrap](./main-bootstrap.md) — startup order and store assembly.
4. [Windows](./main-windows.md) and [Main Storage](./main-storage.md) — window and persistence state.
5. [Claude Service](./main-claude-service.md) → [Query Runner](./main-query-runner.md) → [Session Transcripts](./main-sessions.md) — one query's path from request to disk.
6. [Renderer Bootstrap](./renderer-bootstrap.md) → [Desktop Client](./renderer-desktop-client.md) → [Workbench Page](./renderer-workbench.md) — the renderer's backbone.

[Build and Testing](./build-testing.md) covers the three Vite targets, external runtime dependencies, and verification.
