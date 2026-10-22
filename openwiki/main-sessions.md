---
type: "Service Layer"
title: "Session Transcripts"
description: "Reading Claude session transcripts from disk: JSONL parsing, main-chain building, metadata extraction, history loading, subagents and workflows, and transcript surgery."
tags: ["session", "transcript", "subagent", "workflow"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-91066b7770cdb7180c237a64
    resource: repo://src/main/claude/session-meta.ts
  - id: openwiki-source-604002bee0dc35436e9813c0
    resource: repo://src/main/claude/session.ts
  - id: openwiki-source-fb185eb1d5c921aba381d7fd
    resource: repo://src/main/claude/sessions.ts
  - id: openwiki-source-42d99c5a884698ad958c177f
    resource: repo://src/main/claude/transcript.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Session Transcripts

Claude Code writes every session as a JSONL transcript file. Clotho's session view does not keep its own message store — it reads from these files. [session.ts](../src/main/claude/session.ts) loads messages and chains, [session-meta.ts](../src/main/claude/session-meta.ts) extracts titles and metadata, [transcript.ts](../src/main/claude/transcript.ts) operates on the transcript file itself, and [sessions.ts](../src/main/claude/sessions.ts) owns session/project list identity and path conventions.

## Disk layout and path conventions

Transcripts live at `~/.clotho/projects/<munged>/<sessionId>.jsonl`. The directory name from `projectDirNameFromPath` replaces every non-alphanumeric character in the project path with `-`, matching Claude Code's munging; `claudeDir()` gives the `~/.clotho` root.

A project id comes from `projectIdFromPath`: the path is `path.resolve`d (optionally with a `#workspace` suffix to distinguish workspace entries) then md5'd. The reverse lookup `projectPathForId(projectId)` is provided by [workspace.ts](../src/main/claude/workspace.ts).

Subagents and workflows live under the session directory: `<sessionId>/subagents/agent-<id>.meta.json`, `<sessionId>/subagents/agent-<id>.jsonl`, `<sessionId>/workflows/<runId>.json`, `<sessionId>/subagents/workflows/<runId>/journal.jsonl` and `agent-<id>.jsonl`.

## JSONL parsing

`parseSessionEntries(buffer)` runs `JSON.parse` per line, keeping only entries with a `uuid` string; bad lines and uuid-less lines are silently dropped. The returned `SessionEntry[]` (the `ClaudeJsonLine`) is the raw material for every loader.

## Main chain building

A transcript is not a linear array but a tree linked by `parentUuid`: a resend after interruption forks it. `buildMainChain(entries)` reconstructs the current main chain:

- When no entry has a `parentUuid` (very early sessions), return all indexes.
- Build `uuid → index` and the set of `parentUuid`s; leaves are entries whose uuid appears in no `parentUuid`.
- The tip is the **last entry that is both a leaf and conversational** (`user`/`assistant`); only if none exists fall back to the last leaf.
- Walk `parentUuid` upward from the tip, stopping on a cycle (`visited` guard), then reverse into oldest-to-newest.

`finalizeChain(entries, chain)` turns the index chain into a message list, filtering out `isMeta`, `isSidechain`, `type === 'system'`, and entries carrying a `teamName` — bookkeeping, not conversation.

`resolveMessageEditAnchor(entries, messageId)` answers "where does editing this user message resume from": the target must be a `user` entry, else throw; walk `parentUuid` upward and the first `assistant` hit yields `{ strategy: 'resume', resumeSessionAt: parentUuid }` (resume after that assistant reply); reaching the root with no assistant yields `{ strategy: 'fresh' }`. Cycles and missing parents throw `cyclic transcript` and `Cannot find transcript parent` respectively.

## Message loading

`loadSessionMessages({ sessionId, projectPath })` is history loading's core, fetching two datasets in parallel:

1. `getSessionMessages(sessionId, { dir })` (SDK) gives normalized messages.
2. `loadRawSessionEntries` reads the same JSONL directly for raw entries — the SDK drops several kinds, which this reconciles.

Then a three-step merge:

- `sessionMessageToClaudeJsonLine` flattens SDK messages into `ClaudeJsonLine`s, explicitly carrying `type`, `uuid`, `session_id`, `message`, `parent_tool_use_id`.
- `mergeLocalCommandResults` re-inserts `system/local_command` entries after their parent by `parentUuid` — the SDK never returns local slash-command output; the transcript supplies it.
- `mergeApiRetryEntries` sorts `system/api_error` entries with `source === 'request_retry'` back into their original transcript positions (array sort is stable; positionless ones stay at the end). These are traces of SDK-internal retries and must replay as retry cards when the session reopens.

`restoreMessageParents` repairs parent pointers: when a message's `parentUuid` points outside the returned set (merged/filtered away), keep walking the raw entries upward until hitting a uuid inside the set. This is what lets the frontend reattach messages to the chain correctly.

Finally each message passes `enrichTaskNotification` (see [Query Runner](./main-query-runner.md)), turning background-task `<task-notification>` entries into `system/task_notification` and reading file content when only `output_file` is present.

`loadSessionHistory({ sessionId, projectId })` is just `projectPathForId` followed by a `loadSessionMessages` call.

## Session metadata

`extractSessionMeta({ head, tail })` pulls a `SessionMeta` from head/tail window text of the transcript (not parsed entries). A sidechain first line returns undefined immediately — subagent transcripts have no title.

- Title priority: `customTitle` → `aiTitle` → `lastPrompt` → `summary` → the first user prompt; if none, undefined.
- `gitBranch` takes the tail's `fieldLast`, falling back to the head's `fieldFirst`.
- `tag` scans backwards for the last `"type":"tag"` line and takes its `tag` field.

Field extraction deliberately avoids parsing whole JSON lines: `fieldFirst` / `fieldLast` look for the `"key":"` or `"key": ` shapes in the text window, with `extractValueAt` scanning character by character to the closing quote (handling escapes); `fieldLast` keeps the last occurrence by position. The window can be a small slice of the file, avoiding whole-file reads for list pages.

`firstUserPrompt(head)` scans lines for `"type":"user"`, skipping `tool_result`, `isMeta`, `isCompactSummary` lines and local-command noise (`Caveat: The messages below...`, lines starting with `<local-command-stdout>`); a hit runs through `textFromContent` then `cleanCommandTags` — which unwraps `<command-name>` / `<command-args>` slash commands into `name args`, or titles would be blobs of XML.

[sessions.ts](../src/main/claude/sessions.ts) mirrors this on the list side: `sessionInfoToClaudeSession` takes the title from `summary ?? customTitle ?? firstPrompt`, and untitled sessions stay out of the list; timestamps divide by 1000 into seconds.

## Subagents

`listSessionSubagents({ sessionId, projectId })`: `listSubagents` (SDK) gives the id list; each id reads `subagents/agent-<id>.meta.json`, and `parseSubagentMeta` validates the four required fields `agentType`, `description`, `toolUseId`, `spawnDepth` — any miss drops the whole entry; `createdAt` comes from the meta file's `birthtime`.

`loadSubagentMessages` uses the SDK's `getSubagentMessages`, also passing each through `enrichTaskNotification`. Note subagent messages get no parent repair or merging — they are self-contained transcripts.

## Workflow runs

`loadWorkflowRuns({ sessionId, projectId, runIds })` tries two paths per runId (deduped first):

1. **Terminal record**: read `workflows/<runId>.json`; `parseWorkflowRun` validates the `runId` matches and extracts the full `ClaudeWorkflowRun`: status, times, token/tool-call counts, `script`, `logs`, `result`, plus `phases` and `agents`. The file only lands when the workflow reaches a terminal state, so missing it is normal.
2. **In progress**: fall back to `loadLiveWorkflowRun`, reading `subagents/workflows/<runId>/journal.jsonl`. In the journal, `type === 'started'` creates agents and `type === 'result'` records results; with no agents it returns null. Each agent also tries its transcript `agent-<id>.jsonl`: the first user message becomes `promptPreview`, `tool_use` scans yield the last tool name and summary, and min/max timestamps give startedAt/lastProgressAt. An agent without a journal result is `running`, otherwise `done`. The whole run is marked `status: 'running'`, `isPartial: true` — an in-progress approximation, not a terminal record.

`parseWorkflowPhases` merges two sources: the `phases` array and `workflow_phase` entries inside `workflowProgress`, paired by title and deduped by index, each side filling the other's gaps. `parseWorkflowAgents` only accepts `workflowProgress` entries with `type === 'workflow_agent'`; label-less ones drop, and defaults are `state: 'queued'`, `phaseIndex: 0`.

## Transcript surgery

Both surgery functions rewrite the JSONL file directly, and both start with `assertPathSegment` validating that projectId/sessionId is not empty, `.`, `..`, or contains path separators.

**`dropTrailingTurn({ projectId, sessionId, userMessageUuid, allowLaterConversation })`** physically deletes a recalled user turn: locate the target line by uuid, drop everything after it, and the next send resumes from the last complete assistant reply.

- A target that is not a `user` entry → refused (`dropped: false`).
- A real user prompt after the target (`isUserPromptEntry`) without explicit `allowLaterConversation` → refused: another client continued the conversation. Edit scenarios pass `true`, because editing restarts from the edited message and later turns are deliberately dropped.
- When the uuid cannot be located and the file holds only bookkeeping (no conversational entries), delete the whole file so the reserved id can start a fresh query, returning `removedSession: true`.
- If deletion leaves no conversational entries → also delete the whole file.
- Success writes only the prefix and returns `{ dropped: true, removedSession: false }`.

**`purgeDeadPairs({ projectId, sessionId })`** removes all dead turns — the span between two root user prompts with no assistant reply (`model !== '<synthetic>'`) in between. The comment records this as verified against the CLI: turns deleted mid-conversation need no parentUuid reconnection when reopened, so the whole span goes, bookkeeping included. If nothing conversational remains → delete the file, `removedSession: true`; otherwise rewrite the file and return the deleted count.

The shared judgment lives in the file header: `INTERRUPTION_MARKERS` (`[Request interrupted by user]` and its tool-use variants) do not count as user prompts, and `isConversationalEntry` = a real user prompt or a non-synthetic assistant reply.

## Relation to other layers

[Session Registry](./main-query-runner.md) calls both surgeries in `rebuildRaw`: edits use `dropTrailingTurn` (with `allowLaterConversation: true`) and rebuilds run `purgeDeadPairs` first; either reporting `removedSession` nulls the resume. The session and project lists are consumed by [Workspace and Projects](./main-workspace.md).
