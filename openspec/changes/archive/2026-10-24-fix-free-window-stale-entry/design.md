# Design

## Context

The entry lifecycle spans three places (see proposal.md — Why):

- Write: `withFreeWindowEntry` / `withProjectWindowEntry` insert entries at window creation; the tracker flush on `close` refreshes geometry repeatedly.
- Remove: the `closed` handler ([app-windows.ts:242](src/main/app-windows.ts#L242)) calls `withoutWindowEntry` only for project windows.
- Restore: `restoreFreeWindows` assumes "stored entries = windows open at quit", which stale entries break.

All storage writes go through the `transformStorage` serialized read-modify-write queue, which already prevents concurrent overwrite.

## Goals / Non-Goals

**Goals:**

- Removing a free window's entry when it is closed by hand.
- Keeping the quit path (`isQuitting`) unchanged: windows open at quit are all restored next launch.
- Matching the existing project-window removal semantics.

**Non-Goals:**

- No cleanup of entries accumulated before the fix (see Risks).
- No change to the `projectState` lifecycle (project workspace state keeps outliving its window).
- No new restore strategy such as "remember all windows but restore a subset".

## Decisions

### D1: Remove the free entry in the `closed` event, not `close`

The `close` handler returns right after flushing geometry for a free window; the `closed` handler already has the conditional removal for project windows (`closed?.kind === 'project' && !isQuitting`). Loosening that condition to "remove unless quitting" (`!isQuitting`) puts free and project on the same path — one symmetric change.

**Rejected alternative**: removing in the `close` handler. `close` can be prevented (the project window's async close flow does exactly that), so removing the entry before an uncertain close could drop it wrongly; `closed` fires only after the window is truly destroyed, which is the precise moment.

### D2: Ordering between flush and removal rides the existing queue

The `tracker.flush()` on `close` and the `withoutWindowEntry` on `closed` both go through `transformStorage`, so writes land in order and removal cannot precede the final flush. No extra synchronization.

### D3: Reuse `!isQuitting` as the removal condition, no free/project split on quit

`setQuitting()` runs before any window is destroyed during quit, so `isQuitting` is true by the time `closed` fires and both entry kinds survive — exactly the data source for "restore what was open at quit". The existing comment about project windows ("one closed by hand is gone for good") already describes this rule; it gets generalized once free joins it.

## Risks / Trade-offs

- [Entries accumulated before the fix are not cleaned up and revive once on the next launch] → Accepted: closing them by hand removes each; the count is small (5 right now) and a migration pass is not worth it.
- [`withoutWindowEntry` fires asynchronously on `closed`; a crash between window destruction and the removal landing on disk leaves a stale entry] → Same as the project-window status quo, and a later close clears it; no extra hardening.
- [On Linux/Windows closing the last window quits the app, racing the removal against the quit path] → `setQuitting()` sets the flag synchronously in `before-quit` before any `closed` event, so the condition has no race.
