# Proposal

## Why

Closing a free window never removes its entry from `windowsState.openedWindows` (the `closed` handler only calls `withoutWindowEntry` for project windows). Stale entries accumulate over time, and the next launch's `restoreFreeWindows` reopens all of them as if they were open at quit — closed windows keep coming back.

## What Changes

- When the user closes a free window outside the quit flow, the main process removes its entry from the persisted `openedWindows`, matching the existing project-window behavior.
- The quit flow (`isQuitting`) is unchanged: entries for windows open at quit are kept and restored on the next launch.
- Project-window behavior is unchanged: entries survive quit only, and closing one by hand drops it (already the case).

## Capabilities

### New Capabilities

- `workbench-window-state`: lifecycle of per-window persisted state — how entries in `openedWindows` are written, removed on close, and kept across launches, covering the close vs. quit paths for free and project windows.

### Modified Capabilities

(none — existing `workbench-sidebar` and `workbench-conversation-header` do not cover window entry lifecycle.)

## Impact

- `src/main/app-windows.ts`: the `closed` event handler gains the `withoutWindowEntry` call for free windows outside the quit flow.
- `src/main/window-state.ts`, `src/main/window-state-tracker.ts`: no signature changes; removal reuses the existing `withoutWindowEntry`.
- Storage file `~/.clotho/storage.json`: no new stale entries after the fix; entries accumulated before it are not cleaned up automatically and need one manual close or a hand edit.
