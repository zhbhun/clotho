# Tasks

## 1. Timeline selection per window kind

- [x] 1.1 In `use-projects.ts`, select `activeTimeline` as `windowKind === 'project' ? sessionTimeline : (activeTab === 'current' ? workTimeline : sessionTimeline)` and expose `showTabSwitcher: windowKind === 'free'`; verify `npm run typecheck` passes and existing `use-projects` consumers still typecheck

## 2. Sidebar conditional tab switcher and close scope

- [x] 2.1 Add optional `showTabSwitcher` (default `true`) to `SessionSidebar` and pass it to `SessionListTabs`; render the tab tray only when true, keeping the toolbar row with locate / back-to-top buttons when false; verify with updated `sidebar/index.test.tsx` cases (project window: no `[data-session-tab]` nodes, both toolbar buttons present)
- [x] 2.2 Gate the sidebar `close` prop on `showTabSwitcher && activeTab === 'current'` so project-window rows carry no close action; verify with a test asserting no close menu action on project-window rows
- [x] 2.3 Update `index.tsx` to pass `showTabSwitcher={workbench.showTabSwitcher}` to `SessionSidebar`; verify `npm run typecheck` and `npm run lint` on changed files pass
- [x] 2.4 ~~Right-align the project-window toolbar actions~~ Superseded by 2.5
- [x] 2.5 Project-window sticky list: when `showTabSwitcher` is false render no bar row; move locate / back-to-top into `VirtualSessionList` as the sticky top-right overlay (pre-tab `SessionListActions` form); make group headers sticky within their group span behind the same flag; restore the sticky z-index CSS rules (headers 10, actions 15, scrollbar 20); verify with updated sidebar tests and a CDP visual check

## 3. Verification

- [x] 3.1 Run `npx vitest run src/renderer/pages/workbench/sidebar` and the touched hook tests; all pass
- [x] 3.2 Verify in the running app via `npm run debug` (CDP on 3367): a project window sidebar shows no tab switcher and lists full history; a free window sidebar keeps both tabs
