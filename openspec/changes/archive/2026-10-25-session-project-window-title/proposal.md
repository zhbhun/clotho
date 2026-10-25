# Proposal

## Why

Every workbench window titles itself by project only (`项目名 — Clotho`), so the macOS Window menu and task switcher cannot tell apart two windows of the same project showing different sessions. VS Code-style `active file — folder` titles are the familiar pattern; the session is clotho's equivalent of the active file.

## What Changes

- Window titles become `会话 — 项目 — Clotho`, built from the currently selected session and the bound/current project.
- Without a selected session, the title degrades to today's `项目 — Clotho`; with no project (home), it stays `Clotho`.
- The session segment is truncated with a trailing ellipsis beyond 32 characters (31 + `…`); the project segment is never truncated.
- Session selection, tab switches, and session renames update the title immediately.

## Capabilities

### New Capabilities

- `workbench-window-title`: What the OS-level window title shows per window state (session, project, home) and how long segments may be.

### Modified Capabilities

<!-- none: window title behavior is not owned by any existing spec -->

## Impact

- `src/renderer/pages/workbench/hooks/use-projects.ts` — the document-title effect only; one import (`sessionDisplayTitle`) and a small truncation helper.
- No RPC, main-process, or persisted-state changes; `document.title` already drives the native title (macOS `hiddenInset`).
