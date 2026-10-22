---
type: "Service Layer"
title: "Workspace and Projects"
description: "On-disk project and workspace state: the projects.json registry, project CRUD, session-ownership merging, and per-project git operations."
tags: ["projects", "workspace", "git", "registry"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-cdcd22df1ee1e0659feb3ac3
    resource: repo://src/main/claude/git.ts
  - id: openwiki-source-06bb0cd51ff217e825e85528
    resource: repo://src/main/claude/projects.ts
  - id: openwiki-source-fb185eb1d5c921aba381d7fd
    resource: repo://src/main/claude/sessions.ts
  - id: openwiki-source-04cf33eb28acb6445d578d1e
    resource: repo://src/main/claude/workspace.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Workspace and Projects

This layer grounds the "project" concept on disk: a registry file records projects the user explicitly added, session records discovered on disk supply the rest, and the two merge into the project list that [Claude Service](./main-claude-service.md) exposes. [projects.ts](../src/main/claude/projects.ts) is the registry and CRUD, [git.ts](../src/main/claude/git.ts) the per-project git operations, [workspace.ts](../src/main/claude/workspace.ts) the session-side entry, and [sessions.ts](../src/main/claude/sessions.ts) id and path derivation.

## The registry file

`~/.clotho/projects.json` is a `RegisteredProject[]` array:

```ts
{
  id: string            // md5(path) or md5(path + '#workspace')
  path: string          // absolute path canonicalized to the repo root
  name?: string
  icon?: ProjectIcon
  additional_directories?: string[]
  deleted?: boolean     // tombstone: once discovered/registered, then deleted by the user
  created_at: number
  last_opened_at?: number
  default_provider_id?: string
  default_model_id?: string
}
```

Writes go through `writeRegisteredProjects`: temp file + `rename`, with `updateRegisteredProjects` serializing on the file path and re-reading via `readRegisteredProjectsStrict` before every update — **any invalid record throws for the whole file**, unlike the lenient `readRegisteredProjects`.

Reading has strict and lenient entries: `readRegisteredProjectsStrict` (write paths; bad data throws `Unable to read the project data file`) and `readRegisteredProjects` (read paths; bad data logs `projects.read_failed` and skips). Both run entries through `isRegisteredProject` (field type checks; any object icon is accepted) and `withLoadedIcon` (unrecognizable icon shapes become undefined, letting entries saved by older versions still load), then ids through `trustedProjectId`.

## Workspace entries

One path can hold **two** entries at most: the plain entry and a workspace (with additional directories) entry. The type is **derived, never stored** — `isWorkspaceEntry(project)` checks whether `additional_directories` is non-empty. The id therefore varies with type too: `projectIdFromPath(path, isWorkspace)` md5s the path, appending `#workspace` before hashing for workspace entries.

`mergeProjects` buckets the two kinds by `mergeKey(path, isWorkspace)`, and session discovery feeds only the plain bucket (sessions only describe plain folders), so a path's workspace entry stays independent. Deleting writes a tombstone rather than physically removing: the tombstone **cancels** a same-named session discovery during merge, and re-adding the same path and type later reuses the entry (`createProject`'s `reusable` branch clears `deleted` and keeps the other fields).

`projectWorkspaceId(path, isWorkspace)` is the stable workspace id for the renderer, sharing the same hashing as project ids.

## Id and path derivation

`projectIdFromPath(projectPath, isWorkspace = false)`: `path.resolve` (workspace entries append `#workspace`), then md5.

`projectPathForId(projectId)` reverse-lookups with three fallbacks: the in-memory `projectPaths` cache → the registry (through `canonicalProjectPath`) → session-discovered projects. Finding none throws `Unknown project`. The session and transcript modules both rely on it to turn a projectId into a real path (see [Session Transcripts](./main-sessions.md)).

## CRUD

**`createProject`**: validates the name (trimmed, non-empty, ≤50 chars) and icon; the path goes through `normalizeExistingDirectory` (must exist and be a directory) and `canonicalProjectPath` (resolved to the repo root); additional directories go through `normalizeAdditionalDirectories` — each `path.resolve`d, deduped (including the project path itself), with nonexistent or non-directory ones dropped, becoming undefined when all are filtered. Type follows the presence of additional directories, and the id follows type. A conflict with a live entry of the same path and type throws; otherwise a tombstone is reused or a new entry created.

**`updateProject`**: validates name and icon the same way. Its extra complication — **a type change changes the id**. Adding additional directories to a plain project turns it into a workspace entry, changing the id from `md5(path)` to `md5(path + '#workspace')`. It first checks the target id is unoccupied, then sets `pendingRebind` and rewrites `registered.id`; only after `updateRegisteredProjects` succeeds does it call `rebindProject({ fromProjectId, toProjectId })`. The comment explains the order is deliberate: **the new id must land on disk as fact before anything referencing it migrates** ([Session Storage](./main-storage.md)'s `sessionRebindProject` rewrites index entries and session files' `projectId`). When no registry entry exists, one is rebuilt from session-discovered projects before the change.

**`removeProject`**: entries with a registry record or a same-path session project get a tombstone (the latter first fabricates one, canceling future discovery); entries that were purely registered with no sessions on disk are physically deleted.

**`registerProjectPath`** (open folder) and **`setProjectLastOpened`** / **`setProjectDefaultModel`** are all "idempotent registration": update `last_opened_at` / the default model when an entry exists, otherwise rebuild one from session discovery. Project default models live in the registry, separate from the app-level default model ([Main Storage](./main-storage.md)).

**The homedir is reserved**: `assertNotHomeProjectPath` refuses to create/register it as an ordinary project. It is the built-in work project, guaranteed by `ensureWorkProject` — fixed name `work`, tombstones revive it, and existing icons and model defaults are kept. Home-mode sessions (`projectId === null`) all belong to it.

## The project list

`listClaudeProjects()` fetches three datasets in parallel: the registry (through `canonicalizeRegisteredProjects`), session-discovered projects, and the non-project roots list. Then:

1. `canonicalizeRegisteredProjects` resolves registered paths to repo roots; **a worktree path with no findable repo root drops the whole entry** — an orphaned worktree directory must not appear in the list.
2. Session-discovered projects filter first: `isNonProjectPath` (temp dirs, `~/Library/Application Support`, Caches, XDG dirs, etc.) and `isOutsideHomePath` (paths outside home; Windows exempt because projects often live on other drives). Note only **discovered** projects filter — a user-registered path lists even inside a temp directory.
3. `mergeProjects` merges the two (registered overlays discovered, keeping session lists).
4. `filterInvalidProjectPaths` `stat`s again: a missing directory (`ENOENT`/`ENOTDIR`) drops the entry, other errors (permissions, etc.) keep it.
5. `rememberProjectPaths` refreshes the id → path cache; finally the homedir entry is tagged `is_home: true` and given the default kanban folder icon when it lacks one.

Results sort by name (path's last segment when unnamed, case-insensitive), ties by path.

## Session-ownership merging

`getProjectSessions({ projectId, ownership })` first confirms the project directory is readable (else throws `Project directory is unavailable`), then decides fallback ownership:

- `ownership` is the `claudeSessionId → project entry id` map (`null` = home mode).
- Sessions absent from the map (predating the index, or started outside Clotho) belong to **the path's plain entry**; with no plain entry, to the single entry there is. This is the `isFallbackOwner` computation.
- `listProjectSessions` filters by `ownership[sessionId] === projectId`, admitting unmapped ones per `isFallbackOwner`.

So CLI-started sessions appear in Clotho's project lists without leaking onto the same path's workspace entry. Flags (archived/pinned/unread) merge separately via [Session Storage](./main-storage.md)'s `sessionListFlags`.

`renameSession` and `deleteSession` both deliberately go through the SDK's own storage: the comment explains rename must pass through the SDK so the appended custom-title record carries fields the CLI understands — **nothing else in clotho may write transcripts**. After the SDK delete, delete also removes `<sessionId>.jsonl` and the `<sessionId>/` subagent directory; when a query is cancelled before init, `getSessionInfo` fails and orphan files are deleted directly.

## Git operations

[git.ts](../src/main/claude/git.ts) calls git synchronously via `spawnSync` (`windowsHide: true`), with four exports:

**`isWorktreePath(projectPath)`**: the path's last segment literally equals `worktree`. This is convention, not probing — callers use it to judge whether a session discovery is an orphaned worktree.

**`getProjectRepositoryRoot(projectPath)`**: walks upward from the path looking for `.git`:

- `.git` is a directory → this is the repo root; but it returns only when the **start itself is the root**, else undefined — a subdirectory must not count as a project root (else every folder under `~/code` becomes a project).
- `.git` is a file → reading the `gitdir:` line gives the real git directory, meaning a linked worktree. Then read `commondir`: the main repo's `.git` is `dirname(resolve(gitdir, commondir))`. If unreadable, fall back to counting levels — the git directory looks like `<root>/.git/worktrees/<name>`, so three `dirname`s reach the main repo root.
- Nothing all the way to the filesystem root → undefined.

**`listProjectGitBranches`**: `git for-each-ref refs/heads --format=%(HEAD)%00%(refname:short) --sort=-committerdate`, NUL-split into names and current-branch markers (`*`), sorted by most recent commit. Failure returns null.

**`switchProjectGitBranch`**: `git checkout [−b] <name>`. The name is trimmed and **a leading `-` is rejected outright** — git would read it as an option, not a ref name. Failure returns git's stderr verbatim (whitespace-trimmed) as `error`; success returns the checked-out branch name.

**`getProjectGitBranch`**: `git branch --show-current`, null on failure or empty output (detached HEAD makes `--show-current` print nothing).
