# Proposal

## Why

The header's top-right corner has an "Open in new window" button (ExternalLink icon) that pops the current project out to its own window. The user does not want this button in the header and asked for its removal.

## What Changes

- Remove the pop-out button block from the conversation header's top-right corner (`session/header.tsx`), including its `canOpenInNewWindow` gate, tooltip, and `ExternalLink` usage.
- Keep the header's `onOpenProjectInNewWindow` prop: it also feeds the project switcher button/menu inside the header.
- Keep all other entry points to the same behavior untouched: the project switcher menu item, the project-list row hover action, and the underlying `claude.openProjectWindow` IPC capability.

## Capabilities

Specs are skipped (`skip_specs: true`): this is a pure UI removal with no spec-level behavior contract. No capability covers the header button today, and "the header has no button" is not a durable requirement worth archiving — history lives in git.

## Impact

- `src/renderer/pages/workbench/session/header.tsx` - remove the button block (~lines 151-170) and the `canOpenInNewWindow` condition; imports `ExternalLink` and `Tooltip*` become unused if nothing else uses them.
- `src/renderer/pages/workbench/session/header.test.tsx` - drop the "pops the shown project out..." test; in "offers neither exit nor pop-out inside a project window" keep only the exit assertion.
- All other files with `onOpenProjectInNewWindow` (`session/index.tsx`, `empty-state.tsx`, `project-switcher-button.tsx`, `project-switcher-menu.tsx`, `quick-open/index.tsx`, `use-session-navigation.ts`, `workbench/index.tsx`) stay: the switcher menu, empty state, and quick-open row action still consume the same handler.
