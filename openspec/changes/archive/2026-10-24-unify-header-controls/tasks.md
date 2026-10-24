# Tasks

## 1. Header always renders the controls

- [x] 1.1 In `src/renderer/pages/workbench/session/header.tsx`, remove the `showHeaderActions` condition so `ProjectSwitcherButton`, `BranchSwitcherButton`, and `SessionHistoryButton` render unconditionally.

## 2. Empty state drops the strip

- [x] 2.1 In `src/renderer/pages/workbench/session/empty-state.tsx`, remove the strip branch, the `showProjectStrip` logic, and the `hasTabSessions` prop; keep the centered brand block and the standalone composer.
- [x] 2.2 Update the `SessionEmptyState` call site in `src/renderer/pages/workbench/session/index.tsx` to stop passing `hasTabSessions`.
- [x] 2.3 In `project-switcher-button.tsx` and `session-history.tsx`, delete the `empty-surface` appearance variants and their styling branches.

## 3. Tests

- [x] 3.1 Update `src/renderer/pages/workbench/index.test.tsx`: the no-tabs test expects the header controls instead of the `.bg-project-switcher-surface` strip, with a single `data-window-project-title` in the header.
- [x] 3.2 Run the touched workbench tests plus `npm run check`.
