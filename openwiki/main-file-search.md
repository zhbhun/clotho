---
type: "Service Layer"
title: "File Search and Attachments"
description: "The project file search's multi-backend strategy cascade, safe-root checks, and the main-process attachment reading and validation."
tags: ["file-search", "attachments", "project-filter"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-6b75a03021e0fd4246c43a5f
    resource: repo://src/main/claude/attachments.ts
  - id: openwiki-source-5e206b2ebe8d95b2e4896f2b
    resource: repo://src/main/claude/project-file-search.ts
  - id: openwiki-source-1f349555bcd97a76ec0530f7
    resource: repo://src/main/claude/project-filter.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# File Search and Attachments

This layer solves two problems: finding files inside a project ([project-file-search.ts](../src/main/claude/project-file-search.ts)), and turning user-picked bytes into valid Claude content blocks ([attachments.ts](../src/main/claude/attachments.ts)).

## Capability probing

Everything starts with `canSearchProjectFiles`. It returns a `ProjectFileSearchCapability` with `isGit`, `strategy`, `supported`, `trackedFileCount`, and, on failure, a `reason` and `message`. Three `reason` values:

- `missing-project`: no projectPath (home mode).
- `unsafe-root`: `isSafeProjectSearchRoot` vetoed it.
- `unknown`: catch-all.

### Strategy cascade

Inside a git repository, first count tracked files with `git ls-files -z`:

```ts
const strategy = trackedFiles.length <= FFF_FILE_LIMIT ? 'fff' : (await hasRg(runCommand)) ? 'rg' : 'git'
```

`FFF_FILE_LIMIT = 50_000`. Under the limit, use fff (a local native index with fuzzy matching and scores); over it, degrade to `rg --files`, and if rg is unavailable, to `git ls-files`.

Non-git directories: `rg` when available, otherwise `walker`.

### Safe-root check

`isSafeProjectSearchRoot(projectPath, homeDir)` rejects these roots:

- Empty or whitespace-only.
- Starting with `~` or `~/`.
- Broad Windows roots: `C:\`, `C:\Users` (`isWindowsBroadRoot`).
- After resolution: the filesystem root, the home directory, or `/Users`.

It only decides "can this root be searched", not whether the project appears in the list — that is [project-filter.ts](../src/main/claude/project-filter.ts)'s job. `nonProjectRoots` lists OS/app-managed directories per platform (temp dirs, `~/Library/Application Support`, `Caches`, `Containers`, XDG dirs, etc.), and `resolvedNonProjectRoots` caches these roots along with their `realpath` results so macOS's `/var/folders` and `/private/var/folders` spellings both match. `isOutsideHomePath` treats session-discovery paths outside home as non-projects, with a Windows exemption (projects often live on other drives).

## Listing root entries

`listRootEntries` compresses a full file list into root-level entries: `rootEntriesFromRelativePaths` takes the first segment of each relative path, marking it a directory when a second segment exists (`src/`), otherwise a file. Directories dedupe by name, `.git/`-prefixed entries skip, and the result sorts directories first then by name, `limit` defaulting to 40.

## Search

`search` behavior depends on query and strategy:

- Empty query → straight to `listRootEntries`.
- Strategy `fff` with a warm-session finder for that root → `finder.mixedSearch(query, { pageSize: limit })`, results marked `ranking: 'fuzzy'`, `source: 'fff'`, carrying fff's `score`.
- Otherwise take the file list per strategy (`rg` / `gitVisibleFiles` / `walkFiles`) and run `pathSearchEntries`: the file and each of its ancestor directories get substring matches, hits marked `ranking: 'path'`. Note that when the strategy is fff but the finder is not ready, `source` is `'fallback'` rather than `'fff'` — the renderer can tell the native index was not used.

`visibleProjectFiles` branches slightly differently from search: git repositories uniformly use `git ls-files -z -c -o --exclude-standard` (tracked plus un-ignored untracked), not the tracked-only counting call from probing.

### Walker

`walkFiles` is the last resort, pure Node: read `.gitignore` (only lines without `*` and not starting with `!`), skip `SKIPPED_DIRS` (`.git`, `build`, `dist`, `node_modules`) and `dist-` prefixed directories. Three caps: depth 20, entries 20,000, total time 2,500ms.

### Match highlighting

`matchRanges` computes where the query occurs in each entry's `name` and `relativePath`; the renderer uses it for hit highlighting.

## Outline

`getOutline` probes capability first, then `outlineFromRelativePath` splits a relative path into a node chain: `src/a/b.ts` → `src/` (directory), `src/a/` (directory), `src/a/b.ts` (file). A trailing `/` on the last segment decides file vs directory.

## Warmup lifecycle

fff's finder has index-building cost, hence the warm concept:

- `enterWarmup`: only applies to roots whose strategy is `fff`. An existing or starting finder returns immediately; otherwise create one and `waitForScan(5_000)` (without blocking the return). A creation failure removes itself from the map.
- `exitWarmup`: does not destroy immediately; arms an `idleDestroyMs` timer (default 60s). Re-entering during the window clears the timer and keeps the session.
- On timer fire: `finder.destroy()` and remove from the map.

## Attachments

### Size and count limits

| Constant | Value |
| --- | --- |
| `MAX_TOTAL_BYTES` | 20 MiB (all attachments per request combined) |
| `MAX_IMAGE_BYTES` | 20 MiB |
| `MAX_TEXT_BYTES` | 1 MiB |
| `MAX_ATTACHMENTS` | 20 |

The image limit is deliberately generous: the SDK resamples and compresses oversized images before sending, so a large source file is acceptable and shrinks at send time.

### Type sniffing

`binaryMediaType` identifies PNG / JPEG / GIF / WebP / PDF by magic bytes. On no match it falls to `isPlainText`: a strict UTF-8 decode must pass and no control characters may appear (`\t` `\n` `\f` `\r` allowed, `\x7f` rejected) to qualify as `text/plain`. `sniffAttachmentType` composes both steps into the public sniffing entry; returning undefined means the format is not accepted.

### Two paths

**Disk path** (`loadAttachmentFiles`, the `attachmentRead` RPC): process files one by one; failures land in `rejected` with `name` and `reason` rather than `attachments`. Three sources: `file.data` (base64, from paste), `file.sourcePath` (from the picker), or neither → straight to `unreadable`. Success yields a `ClaudeLoadedAttachment` whose `content.source.path` records `sourcePath ?? null` — a clotho-local provenance field the composer uses to dedupe repeat additions.

`rejectReason` infers the category from the error message: contains `empty` → `'empty'`, contains `limit exceeded` → `'too-large'`, an unsupported message → `'unsupported'`, otherwise `'unreadable'`.

**Send path** (`prepareAttachments` / `snapshotAttachments`): the same 20-item cap, each item consuming `remainingBytes`. Any item failure throws immediately with `<filename>: <reason>`. This validates the content blocks the renderer already provided: text sources re-run the plain-text check; base64 sources get a length pre-filter, then decode, then a **re-encode and compare** — inequality means the original string was not canonical base64, throw `Invalid base64 attachment`; finally the sniffed mediaType must match the declared `media_type`, documents accept only PDF, and images reject PDF.

`sdkContent` strips `source.path` before sending: the API rejects unknown source fields, and that field is only clotho's local provenance.

### Preview

`getAttachmentPreview` reads the file; anything non-image and non-PDF returns `{ dataUrl: null }`, images return a data URL. Any failure (missing, over limit, not an image) is swallowed to null so preview failures never disturb the main flow.
