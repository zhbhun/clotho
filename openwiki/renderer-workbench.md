---
type: "Reference"
title: "Workbench Page"
description: "The workbench page's composition, zustand store, project and session catalogs, workspace tabs, and UI-state persistence."
tags: ["renderer", "workbench", "stores", "persistence", "workspace"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-c44aa8f3ef7c4b1a9f2f2c9a58e13a01
    resource: repo://src/renderer/pages/workbench/index.tsx
  - id: openwiki-source-c44aa8f3ef7c4b1a9f2f2c9a58e13a02
    resource: repo://src/renderer/pages/workbench/hooks/use-workbench.ts
  - id: openwiki-source-c44aa8f3ef7c4b1a9f2f2c9a58e13a03
    resource: repo://src/renderer/pages/workbench/hooks/use-projects.ts
  - id: openwiki-source-c44aa8f3ef7c4b1a9f2f2c9a58e13a04
    resource: repo://src/renderer/pages/workbench/stores/workbench-store.ts
  - id: openwiki-source-c44aa8f3ef7c4b1a9f2f2c9a58e13a05
    resource: repo://src/renderer/pages/workbench/services/session-persistence.ts
  - id: openwiki-source-c44aa8f3ef7c4b1a9f2f2c9a58e13a06
    resource: repo://src/renderer/pages/workbench/services/session-records.ts
  - id: openwiki-source-c44aa8f3ef7c4b1a9f2f2c9a58e13a07
    resource: repo://src/renderer/pages/workbench/services/workbench-persistence.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Workbench Page

[pages/workbench/](../src/renderer/pages/workbench/) is the application's main page: the left session sidebar, the central session area, the settings page, and one global quick-open panel. Its state concentrates in **one cross-session zustand store** ([stores/workbench-store.ts](../src/renderer/pages/workbench/stores/workbench-store.ts)), with side effects scattered across two persistence services and two hooks.

## Composition

[index.tsx](../src/renderer/pages/workbench/index.tsx)'s `WorkbenchPage` is only three provider layers:

```
ProviderUsageProvider        # provider usage cache (settings page and composer share it)
└── ModelConfigurationProvider   # the model catalog, shared across sessions
    └── SessionControllerRegistryProvider   # the per-window controller table
        └── WorkbenchContent
```

Inside `WorkbenchContent`:

```
ModelStartupBoundary        # awaits SDK init and the project catalog
└── ResizableSidebarProvider
    └── ErrorBoundary       # whole-page failure shows LoadFailure
        ├── WorkbenchShortcuts     # command registration, returns null
        ├── SessionSidebar
        └── SessionArea            # the session area, see the session view
    SettingsPage            # a route state, not a separate page
    ProjectDialog           # create/edit project
    SessionActionDialogs    # rename, delete confirm
```

The settings page is not a route but a fullscreen Dialog driven by the `isSettingsOpen` state (see [Settings Page](./renderer-settings.md)). `settingsReturnFocusRef` records the focused element at open and returns it at close; `workbenchFocusRef` serves as the `fallbackFocusRef` backstop.

Session errors dual-write through `handleSessionError`: the controller's runtimeStore takes one copy, the workbench store's `setSessionActivity(sessionId, 'error')` the other — the latter drives the sidebar's activity marker.

The menu's "open settings" arrives via the `menu-open-settings` push, carrying the target category (see [Application Menu](./main-menu.md)).

`ModelStartupBoundary` bypasses the SDK wait under the mock project (`isSdkWaitBypassed`), letting browser development proceed without a real CLI.

## useWorkbench and useProjects

[use-workbench.ts](../src/renderer/pages/workbench/hooks/use-workbench.ts) is 25 lines: spread `useProjects`' results and add one `selectPromptFiles` (forwarding to `claude.selectFiles`). The real logic is all in [use-projects.ts](../src/renderer/pages/workbench/hooks/use-projects.ts) (531 lines).

### Catalog loading

`refreshProjects` is the whole page's single data entry, using `refreshRequestIdRef` for **request-sequence race protection** — a slow request returning after the sequence moved drops its entire result. It fires four parallel requests:

| Request | Purpose | Failure behavior |
| --- | --- | --- |
| `listProjects()` | the project list | rethrown outward, logged as `projectListError` (catalog unloaded plus this error → shows `WorkbenchStartupFailure`) |
| `getProjectSessions(id)` | per-project sessions | a single failure only logs `projectSessionErrors`, **keeping the store's old sessions for that project** (`existingRemoteSessions`) |
| `getProjectGitBranch(path)` | branch name | logged as null |
| `listDraftSessions()` | the local draft index | the whole thing falls back to `{}` |

**A project window loads only its own project's sessions** (when `windowKind === 'project'`, filtered by `pinnedProjectId`), but the project list stays complete — for switching. The draft index filters by project too.

Startup order matters: `describeWindow()` and `workbenchPersistence().ready` **await in parallel**, and only after both land does `refreshProjects()` run. The comment gives the reason — the window identity decides what the catalog loads, and the persisted UI state must arrive first so restored tabs can reconcile against a real catalog.

Two pushes trigger refreshes: `catalog-changed` (another window changed projects) and `window-registry-changed` (the pinned project list changed). Additionally, project windows (or windows with pinned projects) refresh **when the window regains focus** — multi-window changes sync this way.

### Two timelines

`buildSessionTimeline` runs twice, producing the sidebar's two tabs (details in [Sidebar and Quick Open](./renderer-sidebar.md)):

- **history** (`sessionTimeline`): all sessions, `archivedGroup: true`
- **current** (`workTimeline`): `pickOpenOrPinnedSessions` taking "open in any workspace + pinned", no archived group

`activeTimeline` picks one by `activeTab`, and `sessionList` is its flattened array — arrow-key navigation's `focusedIndex` computes over it.

`tabSessions` is what the current workspace's tab bar shows, **filtering out unsaved blank drafts** — those are the new-chat surface itself, not yet tabs. `workspaceSessions` is another slice: in home mode it lists everything (the comment explains home sessions' cwd is the home directory; Claude files them under a self-discovered "project", so `project_id` is never empty and only a full listing works).

### The initial session

`ensureInitialSession` runs on each workspace's first catalog load: with a selected session, skip; already initialized, skip (`initializedWorkspaceDraftsRef` tracks per workspaceKey); otherwise select the project's most recently active session, or create a blank draft when none. `findHomeProjectId` handles the "unselected" case — it resolves to the built-in work project so the initial draft and its candidate history share one projectId instead of the empty project's sentinel.

## WorkbenchStore

[workbench-store.ts](../src/renderer/pages/workbench/stores/workbench-store.ts) (982 lines) is the **cross-session, per-window** application state. In-session state lives in the controller's seven stores (see [Session View](./renderer-session.md)); this holds window-level facts like "which window views which project, which tabs are open".

### State shape

| Field | Meaning |
| --- | --- |
| `projects` | `Record<projectId, WorkbenchProject>` with `gitBranch` and local session ids |
| `sessions` | `Record<sessionId, WorkbenchSession>`, carrying drafts and the local-id map |
| `pinnedSessionIds` | pinned sessions, ordered by `pinned_at` |
| `currentWorkspaceKey` | the current workspace, `'claude'` or `project:<id>` |
| `currentProjectId` / `currentSessionId` | current selection |
| `sessionTabsByWorkspace` | per-workspace tab id lists |
| `activeSessionByWorkspace` | each workspace's active tab |
| `projectMode` | `'project'` or `'home'` |
| `sessionActivity` | per-session activity: idle / processing / awaiting-user / unread-success / unread-error |
| `windowKind` / `pinnedProjectId` / `pinnedProjectIds` | window identity |

`WorkbenchSession` extends `ClaudeSession`: `claudeSessionId` (the local-id ↔ SDK-id bridge), `isDraft`, `isUnsavedDraft` (an in-memory-only blank draft), `updated_at` (local drafts sort by it; `created_at` is immutable).

### Workspace keys

```
workspaceKeyForProject(project)  → `project:${project.workspace_id ?? project.id}`
workspaceKeyForProjectId(id, projects)  → same; missing project falls back to `project:${id}`, empty id to 'claude'
workspaceKeyForSession(session, projects)  → no project_id means 'claude', else derived from the project
```

It keys on `workspace_id` rather than `id`: the same directory can appear as both a "folder" and a "workspace", and their session histories must stay separate (`bindClaudeSession`'s comment makes the same point).

### reconcileWorkspaceTabs

Every catalog refresh recomputes tabs, because sessions may be deleted and ids replaced by local ids. `reconcileWorkspaceTabs` does three things:

1. Merge every workspace's tab ids with the current sessions into a deduped list, **re-homing** each via `workspaceKeyForSession` to the right workspace (a deleted project or changed id does not lose tabs — they just move)
2. Drop `activeSessionByWorkspace` entries pointing at nonexistent sessions, re-homing the rest by session
3. The current session overrides everything: its workspace's active entry must be it

`putSessionLast` guarantees a session never duplicates within a tab list.

### Catalog reconciliation

`catalogState` (replaceCatalog's core) is the densest passage:

- **Local ids win**: index by `claudeSessionId`; a catalog session with an existing local entry reuses the local id — the ids users see never change under them
- **User titles survive**: sessions with `custom_title` are not overwritten by catalog titles
- **Draft marks cannot be un-marked by the catalog**: `wasStarted` records whether the local side already flipped the draft marker; the catalog's drafts index may be a stale read from before `completeLocalDraft` landed, and re-marking would let the persistence subscriber write the draft entry back
- **Locally-only sessions survive**: local-id sessions (`claudeSessionId === null` or id differing from claudeSessionId) and home sessions (belonging to no project catalog — the catalog can never restore them) stay even when absent from the catalog
- **Unread marks are seeds only**: `session.unread` writes into `sessionActivity` only while the runtime has no opinion — the comment explains this guards against a slow "mark read" round-trip flipping a session back to unread
- **The pinned list derives from the sessions themselves**: `pinned_at` is the single truth; the id list is only its sorted projection

### Session operations

`closeSession` / `removeSession` share one epilogue: remove from tabs (`removedTabState` simultaneously computes "which neighbor to select"), switching to the neighbor when the current session closes; **closing a workspace's last tab creates a blank draft**, keeping the UI off an empty surface. The comment notes drafts live only in memory until they have content.

`closeSession` deliberately **leaves activity alone** — the session keeps running in the background; stamping it back to idle would be wrong.

`bindClaudeSession` handles "a local draft's first SDK id": on finding another entry already holding the same claudeSessionId, it **merges the two** — all references (project list, tabs, pins, current session, activity session) uniformly repoint to the surviving id.

`setSessionTitle` versus `setLocalTitle`: the former sets `custom_title` (user-named; catalog refreshes preserve it), the latter only `title` (the prompt-derived title, which a placeholder must not pin over the SDK's later real title).

`setSessionsArchived` **also unpins when archiving** — an archived session must not keep occupying the pinned group in the current tab.

`setSessionActivity` has one special case: `success` / `error` events for **the currently selected session** resolve to idle (the user is watching; not unread), while other sessions become unread-success / unread-error.

### Workspace handoff

`detachWorkspace(projectId)` lifts a project workspace out of this window: first `workspaceUiState` computes the payload to hand over, then it deletes the workspace's tabs, active entry, and blank drafts (those belong only to this window's memory). The caller delivers the returned payload to the target window.

`attachWorkspace(projectId, ui)` receives a workspace handed from elsewhere: tabs take the union, and the active entry follows "handoff's choice → this window's previous → first".

`restoreProjectWorkspace` **seeds** a persisted workspace before the catalog lands: the key can only fall back to the project id at that point, and `replaceCatalog` will re-home the tabs with the real project and derive the true key from the current project — which is why it must also seed `currentProjectId`.

## The two persistence chains

### Session inputs

[session-persistence.ts](../src/renderer/pages/workbench/services/session-persistence.ts) is a **write-behind** store: `update()` changes memory immediately; disk waits 200ms (`FLUSH_DELAY_MS`) to coalesce a batch of dirty records into one write. Writes serialize through `enqueue` into a tail chain, and `writeDirty` walks all dirty entries in one pass.

`SessionRecord` differs from the on-disk `LocalSession`: the former uses `selectedProviderId` / `selectedModelId` fields, the latter one `provider/model` string, with `fromFile` / `toFile` splitting and joining. The comment is explicit: **only LocalSession touches disk**.

Two details:

- **Tombstones**: `remove()` adds the id to the `removed` set, and `load` refuses to backfill the cache for something already deleted — otherwise an in-flight read would resurrect a deleted session.
- **`initialize()` is empty**: the comment explains startup deliberately does not read every session file, loading on demand instead.

`sessionPersistence.flush()` runs at `pagehide` from [main.tsx](../src/renderer/main.tsx), alongside `flushAppSettings` and the log flush; failure logs `persistence.flush_failed` with `target: 'sessions'`.

### The draft index

[session-records.ts](../src/renderer/pages/workbench/services/session-records.ts)'s `workbenchSessionPersistence` subscribes to the store, **maintaining only the draft index** (`claude.updateLocalDraft` / `completeLocalDraft`) and never writing input files — the comment explains catalog changes only update the index, input files load on demand.

Three draft-state operations: `materializeUnsavedDraft` (a blank draft gains content: derive the title, flip the marks, write the input file and index), `persistHiddenDraft` (content but not displayed: persist immediately so quitting loses no input, while keeping `isUnsavedDraft`, still excluded from tabs and history), `discardHiddenDraft` (content cleared again: remove the traces).

`create` flushes explicitly — a user creating a session is deliberate and does not wait for the 200ms coalesce.

### Window and workspace UI

[workbench-persistence.ts](../src/renderer/pages/workbench/services/workbench-persistence.ts) writes "which workspace has which tabs open" into main-process storage (see [Windows](./main-windows.md)). It is a **singleton**, first triggered by useProjects' startup `workbenchPersistence().ready`.

The write target depends on window identity:

```
free window    → windowUiState(state)             → writeWindowUi (the window entry)
project window → workspaceUiState(state, projectId) → writeProjectUi (project state)
```

Without an identity from `describeWindow()`, `FALLBACK_IDENTITY` treats it as a free window. **Write requests during the unknown-identity window suspend** (`hasPendingWrite`), replaying once restore lands.

One guard precedes writing: if the project workspace's project cannot be found in the catalog (`!state.projects[projectId]`), **the write skips entirely** — overwriting with an empty workspace would wipe the stored tabs.

The two projection functions live in the store:

- `windowUiState(state)`: the whole window's payload — the current workspace key plus every workspace's tabs and actives
- `workspaceUiState(state, projectId)`: one project's payload — tab ids and the active id. **Filters out unsaved blank drafts** (they live only in this window's memory; nothing to carry); an active entry outside the filtered list falls back to the first

Writes debounce 250ms (`WINDOW_UI_DEBOUNCE_MS`). Failure logs `window_ui.write_failed`.

Unread marks take another path: subscribing to the store, comparing `sessionActivity` changes, translating unread-success / unread-error into `setSessionsUnread`'s `'success'` / `'error'`. **Activity arriving simultaneously with a new catalog entry does not count as a change** — that is the session index's seed; only state transitions of sessions the runtime already knew need writing back.

Restore forks: a project window reads `readProjectUi` then `restoreProjectWorkspace`; a free window reads `readWindowUi` and sets the three fields directly.
