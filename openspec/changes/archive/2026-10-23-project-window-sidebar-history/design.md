# Design

## Context

`SessionSidebar` renders the same list for both window kinds. The tab state lives in `useProjects` (`activeTab`), and the displayed timeline is `activeTab === 'current' ? workTimeline : sessionTimeline` (use-projects.ts:150). A project window already scopes its catalog to its own project (use-projects.ts:268), so both tabs there show one project's sessions; "current" is a subset of "history". The close action on sidebar rows only exists on the current tab, threaded down as the `close` prop through `VirtualSessionList` → `SessionItem`. See proposal.md for motivation, specs/workbench-sidebar for the behavior contract.

## Goals / Non-Goals

**Goals:**
- Project window sidebar shows the history timeline directly, no tab switcher.
- Keep the toolbar row (locate / back-to-top) in project windows, without tab pills.
- Free window behavior byte-identical to today.

**Non-Goals:**
- No changes to the header tab bar, persistence payloads (`WorkbenchWindowUiState` / `ProjectUiState`), or main process.
- No changes to free-window sidebar behavior.
- No keyboard-shortcut or quick-open changes (they operate on `sessionList` and follow automatically).

## Decisions

**Derive sidebar mode from `windowKind`, not a new prop.** `useProjects` already reads `windowKind`; it can pick the timeline and expose the existing `activeTab` as inert for project windows. `SessionSidebar` gets one new optional prop `showTabSwitcher` (default `true`) computed at the call site as `windowKind === 'free'`, preserving the component's pure-props style.

*Alternative:* branch inside `SessionSidebar` via the store — rejected; the component currently takes no store reads for this concern and tests render it with props.

**Keep `activeTimeline` selection in `useProjects`**: `windowKind === 'project' ? sessionTimeline : (activeTab === 'current' ? workTimeline : sessionTimeline)`. Downstream consumers (`sessionList`, keyboard nav, quick-open) follow unchanged. `setActiveTab` stays but project windows never render the switcher, so it never fires.

**Close scope stays prop-driven.** `SessionSidebar` already gates `close` on `activeTab === 'current'`; with the switcher absent in project windows the list is history, so `close` is simply not passed (condition extends to `showTabSwitcher && activeTab === 'current'`). No `SessionItem`/menu changes.

**Project windows restore the pre-tab sticky list.** With the tray gone the toolbar row renders nothing. `VirtualSessionList` regains the old sticky pattern behind the flag: date group headers stick within their group span (`sticky top-0`, positioned by `top` not transform, headers kept mounted outside the virtual window), and the locate / back-to-top actions render as a `sticky top-0 ml-auto` overlay beside the pinned header, opaque `bg-sidebar`, z-index 15 between group headers (10) and the transient scrollbar (20). Free windows keep the fixed bar and plain scrolling labels — the same `showTabSwitcher` flag decides the form, so the two variants cannot mix.

## Risks / Trade-offs

- [Blank drafts invisible in project-window sidebar] → Accepted by user; draft remains reachable in the main area and header tabs.
- [Inert `activeTab` state in project windows could confuse future code] → Mitigation: derive the timeline from `windowKind` first so the state cannot influence display; note in code.
- [Test churn in index.test.tsx] → Existing tests render free-window props and stay valid; add project-window cases for switcher absence, toolbar buttons, and no close action.

## Migration Plan

Single renderer change, no data migration. Rollback: revert the commit.

## Open Questions

None.
