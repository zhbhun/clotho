# Proposal

## Why

A turn's work timeline (tool runs, thinking) is expanded by default while streaming, but it stays expanded forever after the turn succeeds. Completed turns therefore bury the assistant's final answer under tool noise and leave tall stale timelines in the session, so scrolling back means collapsing each one by hand.

## What Changes

- When a turn completes successfully (streaming ended, no failure, no interruption), its Worked-for header's default expansion flips from expanded to collapsed: the header shows `Worked for <duration>` with the collapsed run summary, and the work timeline folds away.
- Failed and interrupted turns keep the current always-expanded default so their error cards and Stopped-after state remain visible.
- Explicit user toggles (`expandedTurns`) still win over the default in every state; auto-continue resumed turns keep their forced expansion.
- No new persisted state: the collapse is derived in row building from streaming/terminal status already available per turn.

## Capabilities

### New Capabilities

- `workbench-conversation-turns`: Owns the per-turn presentation rules in the conversation timeline — the status header (Working-for / Worked-for / Stopped / Failed), its default expansion, and what stays visible when collapsed.

### Modified Capabilities

None.

## Impact

- `src/renderer/pages/workbench/session/conversation/conversation-rows.ts` — default-expansion derivation in `buildConversationRows` (single condition).
- `src/renderer/pages/workbench/session/conversation/conversation-rows.test.ts` — new cases for completed-turn collapse; existing expansion cases keep passing.
- No store, service, IPC, or i18n changes; scroll anchoring on collapse relies on the measured-height restore already in place (commit 18678f6).
