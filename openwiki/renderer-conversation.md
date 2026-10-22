---
type: "Reference"
title: "Conversation Rendering"
description: "How a session transcript becomes rendered dialogue: message parsing, turn folding, tool state, virtual scrolling, and live assembly."
tags: ["renderer", "conversation", "transcript", "virtualization", "streaming"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-81883dd6dffcfd85e1f50171
    resource: repo://src/renderer/pages/workbench/session/conversation/background-tasks.ts
  - id: openwiki-source-17f014e90c513987f525f18f
    resource: repo://src/renderer/pages/workbench/session/conversation/conversation-rows.ts
  - id: openwiki-source-5108f8920d1ad8821c4abf45
    resource: repo://src/renderer/pages/workbench/session/conversation/conversation-toc.tsx
  - id: openwiki-source-f0d6c4dbcf335712b7f519db
    resource: repo://src/renderer/pages/workbench/session/conversation/file-changes.ts
  - id: openwiki-source-ddc2ecfd202b162419e25885
    resource: repo://src/renderer/pages/workbench/session/conversation/historical-message-editor.tsx
  - id: openwiki-source-13df58d964a569484d0e67f5
    resource: repo://src/renderer/pages/workbench/session/conversation/task-items.ts
  - id: openwiki-source-9894b89849a4c1bbf0e4a0f2
    resource: repo://src/renderer/pages/workbench/session/conversation/timeline-items.ts
  - id: openwiki-source-399746969ff1df06fbf4c397
    resource: repo://src/renderer/pages/workbench/session/conversation/timeline.tsx
  - id: openwiki-source-15c49793bfaa219df5eca1f8
    resource: repo://src/renderer/pages/workbench/session/conversation/tool-state.ts
  - id: openwiki-source-d17ae22d08bd7f5066360391
    resource: repo://src/renderer/pages/workbench/session/conversation/turns.ts
  - id: openwiki-source-30058717cbc909bea89bfbb0
    resource: repo://src/renderer/pages/workbench/session/conversation/use-stream-stall.ts
  - id: openwiki-source-ea2963358c9d4504faf45176
    resource: repo://src/renderer/pages/workbench/session/conversation/use-tool-display-hold.ts
  - id: openwiki-source-79e7f330eb8df1108106be53
    resource: repo://src/renderer/pages/workbench/session/conversation/virtual-conversation.tsx
  - id: openwiki-source-3d2ff48d5408d69a62d937e8
    resource: repo://src/renderer/pages/workbench/session/conversation/work-runs.ts
  - id: openwiki-source-b02ac97a8f24f3d1378e9f89
    resource: repo://src/renderer/pages/workbench/session/services/history-service.ts
  - id: openwiki-source-8d01be073fd232c3ee060f68
    resource: repo://src/renderer/pages/workbench/session/services/message-edit-service.ts
  - id: openwiki-source-39fa0e1b629048593e9d8d25
    resource: repo://src/renderer/pages/workbench/session/services/message-stream.ts
  - id: openwiki-source-9f2e71aaed3b768ba15ad1d1
    resource: repo://src/renderer/pages/workbench/session/services/message.ts
  - id: openwiki-source-a3cf654d7650eabb8b1e5c24
    resource: repo://src/renderer/pages/workbench/session/services/turn-stream.ts
  - id: openwiki-source-0311058df891f078f5ca0395
    resource: repo://src/renderer/pages/workbench/session/subagent-conversation.tsx
  - id: openwiki-source-c9ed07e2356ddad6e50ceedd
    resource: repo://src/renderer/pages/workbench/session/use-conversation-auto-scroll.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Conversation Rendering

This layer turns the JSONL transcripts the main process writes into the scrolling dialogue on screen. Data starts at [Session Transcripts](./main-sessions.md), parses into `ClaudeMessage` in [services/message.ts](../src/renderer/pages/workbench/session/services/message.ts), assembles live through [services/message-stream.ts](../src/renderer/pages/workbench/session/services/message-stream.ts) and [services/history-service.ts](../src/renderer/pages/workbench/session/services/history-service.ts), folds into turns in [conversation/turns.ts](../src/renderer/pages/workbench/session/conversation/turns.ts), flattens into rows in [conversation/conversation-rows.ts](../src/renderer/pages/workbench/session/conversation/conversation-rows.ts), and finally virtual-renders in [conversation/virtual-conversation.tsx](../src/renderer/pages/workbench/session/conversation/virtual-conversation.tsx).

## The message model

`ClaudeMessage` is the renderer's only message shape: `id`, `uuid`, `parentUuid`, `role`, `content`, `blocks`, plus semantic markers — `isMeta`, `isInterruption`, `queryError`, `apiRetry`, `compaction`, `taskNotification`, `parentToolUseId`, `attachments`. `isUserPromptMessage` is the sole criterion for "this is a user prompt": user role, not meta, not sidechain, no `parentToolUseId`.

`parseClaudeLine(line, index)` is the per-line entry: on `JSON.parse` failure it keeps the data by wrapping it as a `rawType: 'stderr'` system message — the CLI's non-JSON stdout noise still displays. `claudeJsonToMessage(entry, index)` does the real mapping, with `index` feeding stable `id` generation.

Three derived parsers each own one concern:

- **`parseApiRetry`** recognizes both shapes: the live CLI's `system/api_retry` (snake_case `retry_delay_ms`) and the transcript's `system/api_error` + `source: 'request_retry'` (camelCase `retryDelayMs`). Live counting and history replay therefore share one card.
- **`parseCompaction`** recognizes both `compact_boundary` and `status` triggers, producing the compaction info the divider shows.
- **`parseAssistantModel`** reads the assistant frame's model name, **excluding `<synthetic>`** — that is an auto-continuation's empty frame, not a real model switch.

`shouldSkipEntry` centrally lists non-rendered entries: response-less synthetic frames, compact summaries, local-command output echoes, model-switch receipts, agent messages, output-limit notices, image annotations, and the structural types `attachment` / `file-history-snapshot` / `last-prompt` / `queue-operation` / `ai-title`. Survivors reach `parseEntry`, which decides role and blocks: `local_command_output` shelled to its body, `system/init` a banner, `tool_use` and `tool_result` paired into tool items, thinking its own block; `inferRole` backstops unknown roles.

`parseTaskNotification` extracts taskId, status, and summary from the XML-style `<task-notification>` text, with `xmlTextField` as the generic field helper.

## Live assembly

Live and history take complementary paths.

**`StreamAssembler`** ([message-stream.ts](../src/renderer/pages/workbench/session/services/message-stream.ts)) eats `--output-format stream-json` lines. It maintains one **placeholder message** per stream, keyed `parent:<toolUseId ?? 'root'>` — the CLI stamps every stream_event with its own uuid, so uuid cannot key the placeholder; `parentToolUseId` is the stream's identity, one for the root conversation and one per subagent.

`content_block_delta` mutates the placeholder's blocks directly — that is the typing effect. The hard part is the **index misalignment between placeholder and committed blocks**: the CLI emits a full assistant frame after finishing each segment (thinking, text), and the frame covers only its own span. `finalizeStreamedBlocks` therefore retires only the "prefix-matching" blocks — comparing block types one by one, switching only on a full match and accumulating `offset`; the rest stay in the placeholder accumulating. `mutateBlock` converts the CLI's global index with `event.index - offset` into the placeholder's local index. At `message_stop`, an empty placeholder is deleted; otherwise the uncommitted tail remains — an interrupted turn displays on it until the next message restarts the stream.

**`HistoryService`** ([history-service.ts](../src/renderer/pages/workbench/session/services/history-service.ts)) is the renderer's message ledger. `load()` pulls the transcript from the main process, first using `deadTurnIndexes` to find "dead turns" — the span after a root prompt with no real assistant reply, ending in an interruption marker — whose wreckage only the next rebuild clears from the JSONL, hidden at load. It also records `lastAnchorAssistantUuid` from the last main-chain assistant entry's uuid, used to judge whether a persisted context-usage snapshot still describes this session.

`ingestLine` is the live entry, handling several things in order: `system/init` lands `claudeSessionId` and notifies binding; `commands_changed` updates the command list; frames during a recalled tail are swallowed wholesale; `isMeta` user lines skip; during pending-send, root user lines **defer confirmation** (`rootUserHistory`) so the optimistic card shows first and swaps identity when the real line arrives; local-command output and API retries get receive timestamps. Finally it reaches `StreamAssembler.processLine`, falling back to `parseClaudeLine` only on false.

Notifications are **frame-coalesced**: every delta bumps the revision, but `schedulePublish` squeezes them into one `replaceMessages` per frame via `requestAnimationFrame`. The comment explains per-delta notifications interleave synchronous updates between scroll/measure writebacks, exhausting React's nested-update cap ("Minified React error #185") and killing the turn. A turn's end goes out immediately via `flushPendingPublish` so terminal state is never a frame late.

`applyRecalledInput` handles "sent then cancelled" prompts: find that user message, confirm nothing follows it (no root prompt, no reply), truncate to before it, restore the original into the composer, and record `markRecalledTail` — later follower replays of this tail keep swallowing frames.

**`TurnStreamService`** ([turn-stream.ts](../src/renderer/pages/workbench/session/services/turn-stream.ts)) owns the live lifecycle surface: `elapsedOrigin` decides the timing start (a confirmed historical timestamp wins, falling back to the optimistic prompt's timestamp — the CLI never echoes a pushed user line), `startElapsedTicker` ticks elapsed every 200ms. `carriesRealTurnContent` judges whether a frame counts as real output, used to **suppress** history replay in a new send after the previous turn was interrupted. `armRetryStall` gives an API-retry chain a 120-second deadline (plus that attempt's `retry_delay_ms`): a sleeping machine or frozen connection produces no more frames, so on timeout the turn settles in place instead of showing "Retrying..." forever.

## Turn folding

`computeTurns(messages)` folds the linear message stream into `ConversationTurn[]`. A new root prompt opens a new turn; within a turn, `parentToolUseId` groups subagent output, and tool results arriving as standalone user messages become work blocks.

Folding rules:

- **`isCancelledTurnArtifact`**: walks `parentUuid` upward, stopping at an interruption marker or a user prompt — used to recognize orphan frames a cancelled turn left behind.
- **`foldCompactionItem`** and **`foldModelSwitch`**: compaction and model-switch dividers take no standalone message slot but fold into the turn, rendering as divider rows.
- An interruption marker marks the turn `isInterrupted` and records its end timestamp for "Stopped after X".
- `queryError` becomes `turn.failure`, an error card at the turn's tail.
- The tail's `finalize` phase runs `normalizeTimelineItems` (merging consecutive Reads), `reconcileBackgroundTasks` (background task states), and `normalizeTaskItems` (task cards).

`computeLastSentTurnId` finds "the last turn actually sent" — it decides which turn expands by default. `computeSubagentTimeline` is the subagent view's simplified version: timeline only, no turns.

## Timeline items

[conversation/timeline-items.ts](../src/renderer/pages/workbench/session/conversation/timeline-items.ts) translates messages into `ConversationTimelineItem`: text / thinking / tool / task / api-retry / compaction. `appendTimelineItems` is the append entry — consecutive text fragments merge into one (the typing effect relies on it), thinking stays separate, and a `tool_use`'s id anchors on `toolUseId` rather than array index, keeping ids stable during deltas.

`pairToolResult` **scans backwards** for the pairing `tool_result` (results may arrive many entries after the call), anchoring on `tool-result-<id>`. `isAgentToolName` recognizes `Agent` / `AgentTool` / `Task`; `applyAgentTaskNotification` lets a subagent's task notifications update an already-rendered tool item. `normalizeTimelineItems` merges consecutive Reads into `coalescedReads` — reading ten files at once is one item on screen.

**Task cards** ([task-items.ts](../src/renderer/pages/workbench/session/conversation/task-items.ts)): `normalizeTaskItems` folds TaskCreates into collapsible cards. On creation the card snapshots tasks as pending; TaskUpdate / TaskStop keep their own tool rows and only advance "where the next card opens" merge state — once every task in a card reaches a terminal state (completed / cancelled), the next create opens a new card. `latestTaskItems` serves the task-progress panel: replaying the latest task states from the events themselves, because each turn's normalization starts from an empty index, and the snapshot attached to update rows only covers tasks created in the same turn.

**Background tasks** ([background-tasks.ts](../src/renderer/pages/workbench/session/conversation/background-tasks.ts)): `reconcileBackgroundTasks` reconciles across turns. Background commands started by Bash / PowerShell / Monitor may receive their TaskOutput, TaskStop, and task notifications after the parent turn ends; this finds the original tool item by taskId and updates its `backgroundTask` (status, output, exitCode). Command-type tools completing without an explicit exitCode get 0.

## Tool running state

[tool-state.ts](../src/renderer/pages/workbench/session/conversation/tool-state.ts)'s `isTimelineToolRunning` is the sole criterion for "is this tool still running":

- With a `backgroundTask`, its own status decides.
- `toolUseResult.status` in `async_launched` / `remote_launched` / `running` / `in_progress` counts as active; but **once the turn is terminal**, `hasConfirmedBackgroundLaunch` must confirm (agent/workflow tools need an agentId / taskId / runId in the result), else a failed async launch would display as running forever.
- Otherwise: terminal turn means not running; live streaming with a `use`, no `result`, not a coalesced read, and no pending permission request counts as running.

Two hooks handle the tail-display races:

- **`useToolDisplayHold`** ([use-tool-display-hold.ts](../src/renderer/pages/workbench/session/conversation/use-tool-display-hold.ts)): local tools settle in tens of milliseconds; a running title would flash one frame then jump back to Thinking. Each tool's first render records the time, and within **500ms** it keeps the tail; newer tools take over directly, so a burst of fast tools never inserts Thinking placeholders between them. The window arms a timer at the earliest expiry.
- **`useStreamTextStall`** ([use-stream-stall.ts](../src/renderer/pages/workbench/session/conversation/use-stream-stall.ts)): a tail text item unchanged for 2000ms counts as abandoned — even with a `stream-` placeholder id, a Thinking placeholder may appear.

## Work-run grouping

[work-runs.ts](../src/renderer/pages/workbench/session/conversation/work-runs.ts) groups consecutive non-text items into collapsible "work runs". `groupWorkRuns` rules: text, api-retry cards, and compaction dividers always stand alone; items with `isGroupable` false also stand alone and **break** runs on both sides — a tool with a pending permission request therefore never joins a group, keeping its action buttons directly clickable.

The run id anchors on the **first tool's toolUseId**, not the first item's id: thinking items regenerate ids when stream placeholders retire, and item ids would orphan expanded runs (`expandedRuns` keys by runId).

`summarizeWorkRun` produces the collapsed summary segments (how many files read, files edited, commands run, agents dispatched…), with `Map` preserving each category's first-appearance order. `workRunHeader` decides the collapsed header: streaming and the last item running → show that tool; inside the display-hold window → also show it; streaming with no running tool → Thinking placeholder; otherwise → the category summary.

## The row model

[conversation-rows.ts](../src/renderer/pages/workbench/session/conversation/conversation-rows.ts)'s `ConversationRow` is the unit the virtual list consumes: user, status, timeline, work-run, text, api-retry, compaction, error-card, model-switch, file-changes, actions, thinking. `buildConversationRows` produces per turn, with key judgments:

- **Terminal state**: `turnFailures` / `turn.failure` yields 'failed' first, interruption yields 'interrupted', else streaming 'processing' and finished 'completed'. A persisted assistant error frame carries more information than the process's exit stderr, so failure copy prefers the former.
- **Expansion default**: `expandedTurns[turnId] ?? turnId === lastSentTurnId` — the last sent turn expands by default.
- **Collapse window**: an unexpanded turn shows only the part after its last text; `firstCompactionIndex` is a guardrail — compaction dividers never fold out of view.
- **Tail placeholder**: `isSettledTool` (tool ended, outside the hold window), `isIdleTextTail` (text stalled or not a stream placeholder), and the collapse summary together decide whether to add a Thinking row. `thinkingReplacesTailTool` lets Thinking **take over** that ended tool's own row rather than stacking a shimmer beneath it.
- **api-retry card retention**: cards stay only while a retry is still pending, or the turn ended in failure/interruption (the card explains that outcome).
- **ask-class pending requests** filter out before grouping — [ConversationDock](./renderer-workbench.md) presents them directly.
- **file-changes rows** generate only after a turn ends (empty while streaming), so the card reflects the turn's final change set.
- **actions rows** (copy / branch) appear only when not streaming, with `hasTopGap` controlling their top spacing.

`buildSubagentConversationRows` is the subagent view's slim version: an optional initial user card plus timeline, no turns or status header.

## Virtual list and auto-scroll

[virtual-conversation.tsx](../src/renderer/pages/workbench/session/conversation/virtual-conversation.tsx) wraps TanStack Virtual. Config: `overscan: 6`, `directDomUpdates: true`, `useFlushSync: false`, and explicitly opting this hook out of React Compiler (the virtualizer holds mutable scroll state).

- **`retainedKeys`**: cleared when `viewKey` changes; interaction (focus / keydown / pointerdown in capture phase) adds rows to the retained set. A custom `rangeExtractor` merges retained rows into the default range — the run being operated during a collapse/expand must not recycle.
- **Anchor**: `captureScrollAnchor` records "which row, how many pixels into it, the current offset lands in"; `restoreScrollAnchor` inverts to absolute offset. More stable than bare `scrollTop`, because content added or removed above does not drift the reading position. `scrollToTurn(turnId)` serves the table of contents and quick-open.
- **`visibleTurnIds`** derives from the virtual items' intersection with the viewport, passed up to the conversation TOC. Switching `viewKey` resets it.
- A viewport with `clientHeight <= 0` (not yet laid out) degrades to **non-virtual** full rendering, else every row piles at top-0 because heights cannot measure.
- Rows position declaratively with `translate3d(0, start - scrollMargin, 0)`: direct DOM writes skip freshly mounted elements and stay silent on unchanged-size remeasures, leaving rows stacked at the top until the next scroll.

[use-conversation-auto-scroll.ts](../src/renderer/pages/workbench/session/use-conversation-auto-scroll.ts) owns following and restoring:

- `isAtBottom`'s threshold is 4px; leaving the bottom edge by 2px counts as `isContentScrolled`. Resting at the bottom for 200ms **restores** auto-follow, avoiding fights with an ongoing gesture/momentum.
- Content growth is watched by a `ResizeObserver` on the viewport's first child, correcting `scrollTop` in the frame after layout and before paint — one frame late is a visible jump.
- Each session's scroll state (anchors / autoScroll / positions) lives in a module-level Map capped at 24 sessions: the session view reloads on every tab switch (Providers key by sessionId), so state must outlive hook instances.
- Reopening a session prefers restoring the anchor, falling back to bare offset with at most 10 retries — give up while content is still laying out rather than yanking the scroll much later.
- User gestures (wheel / touchmove) cancel pending restores immediately; programmatic scrolls do not.
- The viewport itself sets `overflowAnchor: 'none'`: native anchoring fights the hook's own pinning.

`estimateConversationRowSize` gives each row type an estimate (user 120, status 48, thinking 48, api-retry 76, compaction 40, model-switch 76, error-card 96, file-changes 44 + 36 per file, expanded work-run 32 + 96 per item); real heights backfill via `measureElement`.

## Conversation TOC

[conversation-toc.tsx](../src/renderer/pages/workbench/session/conversation/conversation-toc.tsx) is the thin left-edge navigation, showing at 960px and up. Each turn gets a 2px-tall horizontal marker, 8px wide at rest.

`buildConversationTocItems` takes each turn's user prompt and last non-empty text; `previewText` strips `<ide_opened_file>` / `<ide_selection>` context blocks before compressing whitespace — IDE-injected content must not appear in TOC previews.

Marker width decays by pointer distance: within a 48px influence radius, an `(1 - cos(x·π))/2` ease grows it from 8px to 30px, the nearest marker doubling as the hover target. Pointer movement batches width writes through `requestAnimationFrame`.

"Current turn" has two sources: the externally supplied `visibleTurnIds` (computed by the virtual list) wins; absent that, its own `IntersectionObserver` (root is the scroll viewport, matching by `data-conversation-turn-id`). When the active marker leaves the viewport, `alignActiveMarker` scrolls the marker strip to it. Clicking a marker calls `scrollToTurn`; pointer exit resets all markers.

## Historical message editing

A user message card's edit button swaps `UserCard`'s content for [historical-message-editor.tsx](../src/renderer/pages/workbench/session/conversation/historical-message-editor.tsx)'s `HistoricalMessageEditor` — it embeds a full `PromptComposer` (`appearance="message-edit"`, auto-focused, slash menu below), so editing a historical message uses the same chips, completion, and attachment machinery as writing a new one. Drafts match by `messageId` + `messageUuid`, resuming where editing left off.

Submission is two steps: `onPrepare` for the preview, then `onSubmit`.

[message-edit-service.ts](../src/renderer/pages/workbench/session/services/message-edit-service.ts)'s `MessageEditService.prepare`: `getSessionEditAnchor` locates the transcript position, then `rewindSessionFiles` rehearses with a **dryRun**. A rehearsal reporting "no file checkpoints" does not block — messages copied from other sessions, or sent before checkpoints existed, have no recorded file state and can only edit on current files. A rehearsal showing real file changes returns `status: 'confirm'`, popping a dialog to choose between "resend directly" and "rewind files, then resend"; no file changes sends directly.

`submit` calls `prepareAttachments` to read the picked files' bytes **before** rewinding — the rewind may replace or delete them. It then writes `messageEditDraft` (the inline editor unmounts when streaming starts; the draft must survive at the session layer for retries), performs the real rewind, and finally calls `runPrompt` with `replaceFromMessageId` + `editTarget`. The comment explains why: the main process's rebuild drops the transcript tail after the edited message before the query resumes, so the edited prompt is not appended to the old branch in Claude's context. `begin` / `isCurrent` use an `activeEdit` + `isMessageEditPending` + uuid comparison to block concurrent and stale edits, and `noteClearedTail` records "the rebuild already dropped this tail" so a retry still passes validation when the card has vanished.

## Subagent view

Opening an agent tool switches to [subagent-conversation.tsx](../src/renderer/pages/workbench/session/subagent-conversation.tsx): `computeSubagentTimeline` builds the timeline, `buildSubagentConversationRows` the rows, reusing the same `VirtualConversationList`, `WorkRunRow`, `TimelineEntry`, and `useToolDisplayHold`. The initial user message (`isNaturalSubagentUserMessage`) lifts out of the timeline into its own card; the subagent's status (running / failed / stopped) maps to `turnTerminalStatus`, keeping tool-row running/failed display consistent with the main view.
