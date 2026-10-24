# Proposal

## Why

When a window has no open tabs, the project, branch, and history controls leave the header and re-attach to a strip above the composer. The controls jump between two locations as tabs open and close, and the strip duplicates layout logic (a rounded surface that fuses into the composer) for a state that exists only to decorate the new-chat draft.

## What Changes

- The header always renders the project, branch, and history controls, including when no session tabs are open; without tabs the controls sit at the header edges (project left, branch and history right) with the tab strip empty between them.
- The composer-attached project strip is removed from the empty state; the new-chat surface keeps only the centered brand mark and the composer.
- The `empty-surface` appearance variants of the project switcher button and the history button are removed; the header appearance is the only form.

## Capabilities

### New Capabilities

- `workbench-conversation-header`: Owns what the conversation header shows per window state: the always-present project, branch, and history controls, tab rendering between them, and the absence of a composer-attached control strip.

### Modified Capabilities

- `workbench-sidebar`: No requirement change; sidebar behavior is untouched. (Listed here only to note the boundary was checked — this change moves the empty-state strip's controls, which no existing spec owns.)

## Impact

- `src/renderer/pages/workbench/session/header.tsx` — drop the `showHeaderActions` condition.
- `src/renderer/pages/workbench/session/empty-state.tsx` — remove the strip branch and its `hasTabSessions` prop usage.
- `src/renderer/pages/workbench/session/project-switcher-button.tsx`, `session-history.tsx` — delete the `empty-surface` appearance variants.
- `src/renderer/pages/workbench/index.test.tsx` — flip assertions that expect the strip and a single `data-window-project-title`.
- Renderer display layer only; no store, IPC, or main-process changes.
