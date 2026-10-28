# Design

## Context

Turn expansion is resolved per render in `buildConversationRows` (`src/renderer/pages/workbench/session/conversation/conversation-rows.ts`):

```ts
const isExpanded =
  options.expandedTurns[turnId] ?? turn.userMessage.id === options.lastSentTurnId
```

`lastSentTurnId` is the most recent turn whose user message belongs to `sentTurnIds` (this launch's sends, `computeLastSentTurnId` in `turns.ts`); it never expires, so the sent turn stays expanded after success. The same turn already carries everything needed to know its state: `isStreaming` (last turn + global flag) and `turnTerminalStatus` (`'failed' | 'interrupted' | undefined`, derived at the top of the function). See proposal for motivation.

## Goals / Non-Goals

- Goals: successful turns default to collapsed the moment streaming ends; failed/interrupted turns keep expanding; user toggles keep precedence.
- Non-Goals: no persistence of expansion across sessions; no change to run-level (`expandedRuns`) collapse; no change to the auto-continue forced expansion; no animation/transition work.

## Decisions

### Derive the collapse in row building; no store write

Change the single condition to:

```ts
const isTurnCompleted = !isStreaming && !turnTerminalStatus
const isExpanded =
  options.expandedTurns[turnId] ??
  (turn.userMessage.id === options.lastSentTurnId && !isTurnCompleted)
```

- Alternative considered: write `expandedTurns[turnId] = false` in `finishTurn` (send-service) on success. Rejected: couples the send lifecycle to UI state, needs the confirmed turn id at that moment, and the derived value is already correct per render — zero new state, and interrupted/failed turns are naturally excluded via `turnTerminalStatus`.
- Precedence is unchanged: an explicit `expandedTurns` entry (including a user's manual `false`) always wins.
- The auto-continue path forces `expandedTurns[turnId] = true` in send-service (resume of an interrupted turn); that store value outlives completion, so resumed turns stay expanded after success — accepted, consistent with their longer histories.

### Collapsed rendering reuses the existing path

When `isExpanded` is false the builder already emits the Worked-for status row plus the trailing summary text (`collapsedSummary`, the last non-empty text item) and keeps compaction dividers visible. A completed turn's collapsed state therefore needs no new row types — only the timing of when that path is taken changes.

## Risks / Trade-offs

- [Height jump at completion] → the virtual list already restores scroll from measured heights (commit 18678f6); verify no jump when the collapse happens below the viewport. If the user is scrolled up reading earlier context, the change is off-screen.
- [Hidden tool output on completion] → the timeline is one toggle away (header click); nothing is deleted, and the failure/interrupt paths still expand.
- [Text-only turns] → unaffected: no structured timeline means `canToggle: false` and no collapse path.

## Migration Plan

Single renderer-side condition; no data migration. Rollback is reverting the one-line condition.

## Open Questions

None.
