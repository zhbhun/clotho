# Proposal

## Why

A project window is bound to exactly one project, so its sidebar's current/history tabs both list sessions of the same project: "current" (open tabs + pinned) is just a filtered subset of "history". The split only pays off when one window spans multiple projects — which is the free window's case. Project windows should drop the tab switch and show history directly; the open sessions remain visible in the header tab bar.

## What Changes

- Project windows (`windowKind === 'project'`) render the sidebar session list as the full history timeline, without the current/history tab switcher.
- The toolbar bar above the list stays in project windows but loses the tab pills; the locate-current-session and back-to-top buttons remain.
- Sidebar rows in project windows no longer carry a close action: closing an open session happens through the header tab bar only.
- Blank unsaved drafts no longer appear in the project window sidebar (they never appeared in history before); the new-session draft lives in the main area and header tabs.
- Free windows keep the existing current/history tabs and behavior unchanged.

## Capabilities

### New Capabilities

- `workbench-sidebar`: The workbench sidebar's session list — which sessions it shows per window kind, the current/history switch for multi-project (free) windows, direct history display for project windows, and the list toolbar actions.

### Modified Capabilities

<!-- None: no specs exist yet. -->

## Impact

- `src/renderer/pages/workbench/hooks/use-projects.ts` — timeline selection branches on `windowKind`.
- `src/renderer/pages/workbench/sidebar/index.tsx` + `session-list-tabs.tsx` — conditional tab switcher, close-scope logic.
- `src/renderer/pages/workbench/sidebar/index.test.tsx` — new cases for the project-window variant.
- No main-process, IPC contract, or persistence changes: `sessionTabsByWorkspace` keeps its role for the header tab bar and window hand-off regardless of what the sidebar lists.
