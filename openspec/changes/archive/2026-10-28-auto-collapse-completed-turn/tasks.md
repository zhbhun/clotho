# Tasks

## 1. Collapse derivation

- [x] 1.1 In `src/renderer/pages/workbench/session/conversation/conversation-rows.ts`, derive `isTurnCompleted = !isStreaming && !turnTerminalStatus` and change the default-expansion condition at the `isExpanded` assignment to `options.expandedTurns[turnId] ?? (turn.userMessage.id === options.lastSentTurnId && !isTurnCompleted)`. Verify: existing `npm run test -- conversation-rows` still passes.

- [x] 1.2 Extend `src/renderer/pages/workbench/session/conversation/conversation-rows.test.ts`: a structured-timeline turn whose user message is the `lastSentTurnId`, with no terminal status and `isStreaming: false`, builds a status row with `isExpanded: false` and a collapsed summary; the same turn with `turnTerminalStatus: 'failed'` / `'interrupted'` or `isStreaming: true` keeps `isExpanded: true`; an `expandedTurns[turnId]` entry (true or false) overrides all defaults. Verify: `npm run test -- conversation-rows`.

## 2. Integration check

- [x] 2.1 Run `npm run check` for TypeScript and lint the changed files. Verify: clean pass.

- [x] 2.2 In the debug app (`npm run debug`), send a prompt that produces tool work, let it finish, and confirm the Worked-for header shows collapsed with the summary visible, clicking it expands the run; stop a turn mid-run and confirm it stays expanded. Stop the app afterwards.

## Workflow follow-up

- `/opsx:archive` after tasks complete to sync the new `workbench-conversation-turns` capability spec.
