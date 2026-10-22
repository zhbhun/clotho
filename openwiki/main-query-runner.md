---
type: "Runtime"
title: "Query Runner"
description: "Starting and stopping Claude Agent SDK queries, streaming frames forward, the tool-permission round trip, and how resident session queries are recycled and replayed."
tags: ["query", "runner", "session-registry", "permissions"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-7c9f3787fba110593f431888
    resource: repo://src/main/claude/query-process.ts
  - id: openwiki-source-9625af1e17a246904011493c
    resource: repo://src/main/claude/runner.ts
  - id: openwiki-source-1343bbf5904a596586caf795
    resource: repo://src/main/claude/sdk-binary.ts
  - id: openwiki-source-16f198d7ae727299ccd2cfe5
    resource: repo://src/main/claude/session-registry.ts
  - id: openwiki-source-8eee13ba86010e234396fcc0
    resource: repo://src/main/claude/task-notification.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Query Runner

This layer wraps the Claude Agent SDK's `query()` into a manageable lifecycle. [runner.ts](../src/main/claude/runner.ts) handles a single query's start/stop and streaming; [session-registry.ts](../src/main/claude/session-registry.ts) layers "one resident query per session" on top.

## Event outlet

`ClaudeEventSink` is four callbacks: `onOutput`, `onError`, `onComplete`, `onToolRequest`. Bootstrap's implementation broadcasts each event via `appWindows.broadcast` to all windows — a renderer only cares about streams it owns and drops unknown stream ids.

## startQuery

The essentials of `startQuery(events, { streamId, options }, proxy, extras)`:

- **Option normalization**: `cwd` defaults to homedir; `enableFileCheckpointing: true`; `settings.env` injects `ENABLE_TOOL_SEARCH: 'true'`. The latter is client-side tool lazy-loading — non-core tools' schemas stay out of every request until the model pulls them via ToolSearch. The CLI only enables this for the first-party Anthropic endpoint by default, so without it proxied sessions would re-send every connected server's schema each turn.
- **systemPrompt**: when unspecified, `{ type: 'preset', preset: 'claude_code' }` — otherwise the SDK session gets only a two-line stub prompt.
- **CLI binary**: `resolveClaudeCodeBinary()` prefers the copy under `app.asar.unpacked` when packaged (files inside the asar cannot be spawned) and the project's `node_modules` in development. When not found, the field is omitted so the SDK resolves it itself.
- **Model branching**: a `claude/`-prefixed qualified model has the prefix stripped and goes straight to the SDK; any other model containing `/` goes through `proxy.settingsEnv(model)` to inject the proxy connection, with `thinking` or `effort` set per `proxy.sessionThinking(model)`. Re-injecting effort on every query is deliberate — the model config is thinking's single source of truth, and an in-session `/effort` choice is overridden.
- **canUseTool**: when `permissionMode === 'bypassPermissions'` the whole callback is omitted (bypass auto-approves before the callback anyway, so omitting is equivalent and avoids the SDK's shadowing warning); otherwise it is attached to route tool decisions to the frontend.
- **Input queue**: the caller supplies `promptQueue` (an `AsyncIterable`); turns arrive by push.
- At entry, `process.env.CLAUDE_CODE_ENTRYPOINT ??= 'clotho'` (the SDK default is `sdk-ts`; entrypoints outside `{sdk-cli, sdk-ts, sdk-py}` are not treated as programmatic sessions, keeping Clotho's sessions visible in the list and `claude --resume`). `CLAUDE_CODE_ENABLE_TODO_TOOLS ??= '1'` preserves TodoWrite/TaskCreate-style tools — without it newer models drop them by default and the task-progress UI spins empty.

## Streaming forward

`streamQuery` iterates SDK messages:

- The first `system/init` marks `initialized` and resolves the initialization promise — user messages only enter the session JSONL after init, making it a reliable ready signal.
- Every message passes `enrichTaskNotification` (below) before `events.onOutput`.
- On an SDK error result the default is to throw and end the stream, but resident session queries pass `tolerateResultErrors: true` — an interruption-caused `error_during_execution` or a failed tool only ends the current turn, never the whole stream.
- The error path logs `onError` (with the subprocess stderr's tail) and `onComplete(false)`.
- In `finally`, `sdk[Symbol.asyncDispose]()` runs before `entry.process.waitForExit()`: the SDK's message iterator can end before the subprocess exits, so the process must be awaited — with its writes to the session record flushed — before the record is safely deleted or reused.

## Tool permission round trip

`requestToolPermission` is the `canUseTool` implementation:

- Routing by tool name: `AskUserQuestion` → `kind: 'ask'` (replaces the floating form above the input), everything else → `kind: 'permission'` (approval buttons on the card). This layer routes by name only, never judging risk — the mode decides which decisions reach here.
- A pending promise is stored in the module-level `pendingToolRequests` keyed `streamId:toolUseId`. toolUseId is unique only within one Query, hence the streamId prefix.
- `respondToolRequest(streamId, toolUseId, result)` is called by the frontend via RPC to resolve it. A result missing `updatedInput` gets the original input.
- Already aborted → immediate `deny`; on abort, any still-pending keys are deleted and denied with the message `Interrupted`.
- `pendingToolRequestIds(streamId)` lists a stream's still-open toolUseIds, used by the recycle gate.

## One-shot queries

`startup`, `rewindSessionFiles`, and `sampleSessionContextUsage` share one pattern: hold the prompt with `pendingPrompt()` (a never-resolving iterator), await `initializationResult()` (60s default timeout), do the work, then `closeThrowawayQuery`. Teardown must do all three of `sdk.close()` → async dispose → `waitForExit`: `close()` only starts cleanup and drops the promise, and the subprocess keeps holding the resumed session's lock until it exits — the next query may already be resuming the same id.

## Control commands

`controlQuery({ streamId, command, params })` finds the active query and dispatches: `interrupt`, `rewindFiles`, `setPermissionMode`, `setModel`, `setMaxThinkingTokens`, `applyFlagSettings`, `initializationResult`, `reinitialize`, `supportedCommands`/`supportedModels`/`supportedAgents`, `mcpServerStatus`, `accountInfo`, `reconnectMcpServer`, `toggleMcpServer`, `setMcpServers`, `stopTask`, `getContextUsage`.

`interrupt` distinguishes two cases: an initialized query (subprocess ready, interrupt reliable) uses `sdk.interrupt()`; an uninitialized one may lose the interrupt, so it goes straight to `abortController.abort()`.

`closeQuery` aborts first, then `sdk.close()`, then awaits async dispose, subprocess exit, and `entry.finished`. The comment stresses: message-stream EOF alone is not enough to safely delete or reuse a record.

## Resident session queries

`createSessionQueryRegistry` keeps one query per clotho session (a `SessionQueryEntry`): `sessionId`, `streamId`, `queue`, `abort`, `idleTimer`, `model`, `agent`, `state` (claudeSessionId, status, turnInFlight, toolRequests, backgroundTaskIds), `replay`.

### Lifecycle

`ensure`: an existing non-dead entry returns its snapshot directly; a dead entry is torn down first. On creation, `streamId = session-<uuid>` and `status: 'starting'`. With a `claudeSessionId` it becomes `resume`; without one, `resume`/`resumeSessionAt` are removed and `sessionId` is set to the caller's reserved Claude session id (the first turn's recall recreates the same id) or falls back to the clotho session id, so the CLI's records land under a stable key.

All lifecycle operations (ensure/rebuild/recycle/close/setModel) serialize through `chain(sessionId, ...)` — operations on one session never interleave.

`teardown`: delete the entry, clear the timer, `status = 'dead'`, abort, `queue.finish()`, then `closeQuery`. Finishing the queue last is deliberate — the SDK synchronously pulls the first `next()` inside `query()`, so the queue must hold a pending promise until a push arrives; only a dying query should end it.

### Idle recycling

After 60 idle seconds the `armIdleTimer` fires and passes the gate first; a failed recycle re-arms the timer rather than giving up. The `sessionRecycleGate` has three items: `turnInFlight` → `turn-in-flight`, pending tool requests → `pending-permissions`, non-ambient background tasks → `background-tasks`. Any one blocks recycling — whatever the SDK is still doing while the user walked away must hold the query open.

`recycleCheck({ sessionId, windowId })` lets the renderer ask: no entry → `{ recycled: true }`; gate fails → `{ recycled: false, busy }`; **another window still viewing the session** → `busy: ['open-elsewhere']` — other windows' views should keep the hot query alive rather than watch an in-progress turn die. Only when everything clears does the recycle actually run.

`viewOpened` / `viewClosed` / `dropWindow` maintain `holders`: session → set of window ids currently displaying it. `dropWindow` fires from bootstrap's `service.sessionDropWindow` on window close, clearing all views that window held.

### Frame application and replay

`applyFrame` updates the entry per message: `result` → turn ended, replay cleared; `user`/`assistant`/`stream_event` → `turnInFlight = true`; `system/init` → record claudeSessionId, `status = 'ready'`; `background_tasks_changed` overwrites `backgroundTaskIds` with the SDK's full task set (filtering `ambient` ones); finally the message appends to replay, capped at 500 frames.

`attach` returns the current snapshot (with a replay copy) to a renderer joining mid-turn, letting it catch up on frames already emitted before going live. The snapshot's `pendingToolRequests` is the intersection of the entry's recorded requests with `pendingToolRequestIds` — only ones genuinely still awaiting an answer.

### push

`pushRaw` constructs the `SDKUserMessage`: text plus attachments form content (attachments via `prepareAttachments` with the entry's abort signal); `origin` is `{ kind: 'human' }`, and with a `syntheticOrigin` it sets `isSynthetic: true` and uses that value as origin — the CLI rewrites synthetic messages into non-user frames persisted with isMeta, so they stay out of the rendered history. After queueing, it also emits `events.onOutput(streamId, userMessage)`: the CLI never echoes a pushed prompt, so the broadcast is the only way windows watching this session (including the sender's own stream) see the new user turn; uuid dedupe absorbs the sender's optimistic copy.

### rebuild

`rebuildRaw` stops the old query first: `interrupt` (throws when uninitialized; caught), then `deny` every pending toolUseId (the comment calls this the verified stop recipe: late denies are silently dropped by the CLI), then teardown. Record surgery follows as needed: `dropTrailingTurn` (edit scenarios pass `allowLaterConversation: true`, since editing restarts from the edited message and later turns are deliberately dropped) and `purgeDeadPairs`; if either reports `removedSession`, resume becomes null. Finally `ensureRaw` runs again.

### setModel

When `isClaudeQualifiedModel(entry.model) !== isClaudeQualifiedModel(model)`, it returns `{ applied: false, reason: 'model-class' }` — a claude ↔ proxy switch changes the process environment (proxy base URL), and only a rebuild can apply it. Same-class switches go through `controlQuery('setModel')`, stripping the prefix for claude models. Afterwards, for a non-claude model, `proxy.sessionThinking(model)?.effort` re-applies the effort tier via `applyFlagSettings` (the query options still carry the previous model's mapping); a failure here only warns, never blocks.

### Context sampling

`sampleContextUsage` walks entries, sends `getContextUsage` for ones matching by `claudeSessionId` and not dead, and returns null on failure. [Claude Service](./main-claude-service.md) therefore prefers resident-query sampling and refuses to fall back to the one-shot sampler while a live query exists.

## Task notification enrichment

`enrichTaskNotification` ([task-notification.ts](../src/main/claude/task-notification.ts)) normalizes a `queue-operation/enqueue` entry whose content starts with `<task-notification>` into `system/task_notification`, extracting task-id, tool-use-id, output-file, status, summary, and result from the XML. When result is empty but output_file exists, it reads that file's content to fill in — Claude often reports background Bash/Monitor completion with only an output_file. A read failure returns the entry unchanged.

## Subprocess tracking

`createQueryProcess` ([query-process.ts](../src/main/claude/query-process.ts)) wraps spawn: stderr accumulates, keeping only the last 16 KiB; the subprocess's real exit is tracked independently of the SDK's bounded cleanup wait. Abort forwarding can fire the `error` event before the subprocess exits; only `child.pid === undefined` (spawn itself failed) rejects then, otherwise it keeps waiting for exit.
