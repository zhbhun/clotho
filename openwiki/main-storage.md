---
type: "Reference"
title: "Main Storage"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-30dde318e07c6899e3b541e0
    resource: repo://src/main/app-windows.ts
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-fccbdc214f82218785f1a74f
    resource: repo://src/main/claude-service.ts
  - id: openwiki-source-fb185eb1d5c921aba381d7fd
    resource: repo://src/main/claude/sessions.ts
  - id: openwiki-source-955e47bc1faf9dc7b30400b0
    resource: repo://src/main/claude/settings.ts
  - id: openwiki-source-3c5c01ff6b9b0349fb9d4934
    resource: repo://src/main/session-storage.ts
  - id: openwiki-source-674549ed3826ed2715da09e8
    resource: repo://src/main/shortcuts.ts
  - id: openwiki-source-91625935d15cfb2f643e4696
    resource: repo://src/main/storage.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---


# Main Storage

Every main-process persistence artifact lives under `~/.clotho`, split across four modules. The common thread: **sanitize before writing, tolerate each record when reading** — one bad record must never take down the whole document.

| Module | File | Contents |
| --- | --- | --- |
| [storage.ts](../src/main/storage.ts) | `storage.json` | the recoverable app document (window state, project state) |
| [session-storage.ts](../src/main/session-storage.ts) | `sessions/index.json` + `sessions/<id>.json` | draft index and session inputs |
| [claude/settings.ts](../src/main/claude/settings.ts) | `settings.json` | providers, default model, app preferences |
| [shortcuts.ts](../src/main/shortcuts.ts) | `shortcuts.json` | shortcut overrides |

## The common write path

`storage.json` and `settings.json` write identically: into a temp file in the same directory (`.` + original name + pid + uuid, `flag: 'wx'` exclusive creation, `mode: 0o600`), then `rename` over the target, then `chmod` 0o600; `finally` cleans the temp file. `shortcuts.json` and session-storage's `atomic` are the same idea, simplified (no chmod).

Read paths **never crash on a bad document**: `readStorage` returns `{}` only on `ENOENT` and rethrows other errors (bootstrap catches them); a non-ENOENT throw from `readSettings` lands in bootstrap's `recoverSettings`; `readShortcutOverrides` treats even a JSON parse failure as a warning and returns `{}`.

## The storage document

`AppStorage` is a plain `Record<string, unknown>` currently holding two datasets: `windowsState` (free-window frame/maximized/lastActiveWindow) and `projectState` (each project window's frame). `createStorageStore` provides a versioned API:

- `get()` returns a `structuredClone` deep copy; callers can never hold internal references.
- `update(patch)` and `transform(transformer)` are both **queued** read-modify-writes: a module-level `tail` promise serializes them, each waiting for the previous one to land. Both `persist` first and only then replace `current`, so memory never runs ahead of disk.
- `transform` serves patches that depend on the stored document (window state is exactly this: every write reads the current document back before changing it).
- `flush()` awaits the tail write.

[app-windows.ts](../src/main/app-windows.ts)'s `transformStorage` brings `windowsState` and `projectState` into one transform, each passing `sanitizeWindowsState` / `sanitizeProjectStates` before the write; a write failure only logs `storage.write_failed` and windows keep working. At quit, bootstrap calls `appWindows.flushAll()` to finish it.

## Session storage

[session-storage.ts](../src/main/session-storage.ts) is the heaviest of the four: one `index.json` plus one `<id>.json` per session.

### Index entries

`SessionIndexEntry` describes both drafts and started sessions, with fields appearing as needed: `projectId`/`projectPath`, `claudeSessionId`, `isDraft`, title and timestamps, plus the list-state fields `archived`/`archivedAt`/`unarchivedAt`/`pinnedAt`/`unread`/`unreadAt`.

`assertId` rejects the reserved names `index` and `drafts` and requires ids to match `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$` — index keys are disk filenames, so reserved names are unusable.

### Read tolerance

`readIndex` has three layers:

1. Missing `index.json` → one-time migration of the old `drafts.json`: each entry through `validDraft` and `assertId`, with `isDraft: true`.
2. Unparseable `index.json` → log `session.drafts_index_unreadable` and return an empty index.
3. Each entry through `validEntry` (drafts additionally `validDraft`); bad lines are skipped and counted individually, logging `session.drafts_entries_skipped` if any. The comment states it: one bad line must not hide all drafts, and the next write rewrites the index clean.

`migratedProjectId` handles project ids from before the digest scheme: if a stored id is neither the current path's md5 nor the workspace variant's md5, recompute from the path; both digest ids are trusted as-is, avoiding rewriting workspace entries back into plain ones.

`resolveProjectId` maps a `null` project id to the built-in work project's id — old home sessions stored null and now belong to the homedir's work project.

`sessionRead` reads `<id>.json`; a parse failure or failed validation logs `session.file_malformed` and returns null, letting callers treat it as no such session.

### Drafts and ownership

- `sessionListDrafts` lists only `isDraft` entries, defaulting missing titles/timestamps to `''`/`0`.
- `sessionWrite` validates `validSession(data)` and the optional `validDraft(draft)`, then writes the file; with a draft it writes the index entry as `{ ...draft, isDraft: true }` and **preserves** the existing `claudeSessionId` and `listFlagFieldsOf` — the comment warns that any path rebuilding an existing entry must spread the list-state fields back, or archived/pinned/unread sessions silently lose their markers.
- `sessionCompleteDraft` uses `startedEntry` to convert the entry into a "started session": keeping `projectId`, `claudeSessionId`, and the list-state fields while dropping draft bookkeeping.
- `sessionBindOwner({ sessionId, projectId, claudeSessionId })` records which project entry this session (and its Claude session) belongs to. `sessionOwnership()` produces the reverse `claudeSessionId → projectId | null` map (null = home-mode session, belonging to no project).

`listProjectSessions` consumes that map: unmapped sessions (started outside Clotho, or predating the index) go to the path's plain entry, which is how CLI-started sessions appear in Clotho's lists.

### List state: archived, pinned, unread

The three setters share one structure and solve one problem: **historical sessions never opened in Clotho have no index entry**, yet users still must be able to archive them. The fix is a marker entry prefixed `claude-<sessionId>` that carries only flags.

- `sessionSetArchived`: rewrite bound entries one by one; without one, write a marker. Unarchiving writes `unarchivedAt` as an **auto-archive exemption timestamp**: sessions within `UNARCHIVED_AT_TTL_MS` (14 days) are spared the auto-archive sweep. During the sweep, expired markers without `archived` are deleted, and non-marker entries just lose the `unarchivedAt` field.
- `sessionSetPinned` / `sessionSetUnread`: likewise, the marker is just temporary lodging. `pruneMarker` deletes a bare marker once its flags clear — it has no reason to exist anymore. Drafts (no claude id yet) flag their own entry directly.
- `sessionListFlags` merges all entries' flags by claude id, timestamps taking the newest; **a newer unarchive beats an older archive**: `flag.archived = (flag.archivedAt ?? 0) > flag.unarchivedAt`.

[Claude Service](./main-claude-service.md)'s `listSessions` merges the flags into the sessions listed by [Workspace and Projects](./main-workspace.md); `setSessionsArchived`/`Pinned`/`Unread` directly forward to the three setters, throwing when `sessionStore` is missing.

### Rebinding and deletion

- `sessionRebindProject({ fromProjectId, toProjectId })` moves every index entry with `projectId === fromProjectId` to the new id, then scans all `.json` files in the directory (skipping `index.json` and `drafts.json`) rewriting each file's `projectId`. Triggered by `updateProject` when the project id changes (e.g. joining a worktree).
- `sessionDelete` removes the file and the index entry.
- `sessionDeleteProject` scans all session files, deleting those matching after `migratedProjectId`; unreadable files are skipped and counted, logging `session.delete_project_skipped` at the end — one bad file must not strand the remaining sessions and the index.

All writes serialize through `run()`, so only one read-modify-write runs at a time.

## Clotho settings

[claude/settings.ts](../src/main/claude/settings.ts) manages `settings.json`: `providers`, `defaultModel` (a qualified model string), `language`, `defaultPermissionMode`, `archiveInactiveSessions`, `appearance` (theme, pointerCursor, reducedMotion, dark and light themePalettes).

### Write-path guards

**`sanitizeAppPreferences(value)`** is the entry for all preference writes (bootstrap startup and the `appSavePreferences` RPC both pass through): non-object input becomes `{}`; each field validates against a whitelist enum, falling back to `DEFAULT_APP_PREFERENCES` when out of set. Each `themePalettes` palette passes `sanitizeThemePalette`: accent/background/foreground must match `^#[\da-f]{6}$` or fall back (matches are lowercased), and preset must be non-empty. This guarantees every value written to the document is legal, rather than guessing at render time.

**`sanitizeDefaultModel(value, providers)`** returns the value only when it is a **real `providerId/modelId` under some provider**, else undefined. Provider changes re-run it ([Claude Service](./main-claude-service.md): `persistProvider`, `deleteProvider`, `saveDefaultModel` all include the step), so the document never keeps dead references to deleted models.

`readSettings` passes each provider through `normalizeProvider`; a missing `defaultModel` falls back to the legacy `models.fallback` role mapping. The write path `createSettingsStore` also queues, deep-copying before each `update` reaches the updater.

### recoverSettings

`createSettingsStore(initial, persist, recover?)`'s `recover` is bootstrap's safety net: when `readSettings()` throws (non-ENOENT), bootstrap starts with `defaultSettings()` and passes `readSettings` as recover. The first `update` then **re-reads the disk** instead of mutating the in-memory defaults — a `shouldRecover` flag guarantees it happens once, logging `settings.recovered` on success. So if an external writer corrupts the settings file, the user's next in-app preference change restores the disk's real content rather than paving over it with defaults.

## Shortcut overrides

[shortcuts.ts](../src/main/shortcuts.ts) stores `~/.clotho/shortcuts.json`: `CommandId → ShortcutBinding[]`. Reads and writes pass `sanitizeShortcutOverrides`, validating each binding through `getShortcutBindingIssue`:

- Non-object → `invalid-shape`.
- `key` not a string, `modifiers` not a string array, or an unregistered modifier → `invalid-shape`.
- Empty `key` → `empty-key`.
- Normalizes to a modifier by itself → `modifier-only`.
- No modifier and a single character or `space`/`spacebar` → `bare-printable` (bare letter keys swallow normal typing).

On read, invalid entries are counted; more than zero logs `shortcuts.read_failed` and returns the usable portion. `writeShortcutOverrides` does not sanitize before writing (the renderer owns that), but `createShortcutStore`'s `set` validates again and throws — an illegal binding never enters storage. `reset(commandId)` deletes that command's override, returning to the [commandCatalog](../src/shared/shortcuts.ts) defaults.

## Startup assembly

[bootstrap.ts](../src/main/bootstrap.ts)'s order: `readStorage` (failure falls back to `{}` with a warning) → `createStorageStore` → `ensureWorkProject` → `createSessionStorage(clothoDir()/sessions, workProjectId)` → `readSettings` (fallback + recover) → `createSettingsStore` → `readShortcutOverrides` → `createShortcutStore`.

The three stores then feed window management (stateStore), Claude Service (settingsStore + sessionStore's six methods), and menu/shortcuts (shortcutStore). The quit flow is in [Main Bootstrap](./main-bootstrap.md): stop the proxy, flush window state, close session queries, and only then `shutdownLogging`.
