# Design

## Context

The header and the empty-state strip each own a copy of the project/branch/history controls today. `ConversationHeader` hides them via `showHeaderActions = sessions.length > 0 || activeSessionId === null`, and `SessionEmptyState` renders a `bg-project-switcher-surface` strip fused into the composer (`rounded-t-3xl` + `-mt-4` overlap) when `!hasTabSessions`. Both buttons expose an `empty-surface` appearance variant sized for the strip. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One rendering location for the three controls: the header, in every window state.
- Delete the strip layout and the `empty-surface` variants rather than leaving them unused.

**Non-Goals:**
- Restyling the header controls (compact `secondary`/`mute` forms stay).
- Changing `pending-message.tsx`, which reuses the same surface token for its own overlay.
- Any sidebar, store, or window-management behavior.

## Decisions

- **Delete, don't hide, the strip code path.** `SessionEmptyState` keeps the centered brand block plus composer and loses `hasTabSessions`; the strip branch, the `bg-project-switcher-surface` classes, and both `empty-surface` variants go. Alternative — keep the variants dormant — leaves dead code behind a flag nobody sets.
- **Reuse the header's existing edge layout for the tabless state.** With zero tabs, `SessionTabs` renders nothing between the left project button and the right actions cluster, so removing `showHeaderActions` alone produces the edge-aligned layout; no new positioning code. The `data-has-tabs` header attribute and `isContentScrolled` border behavior are unaffected.
- **Keep the strip's overlapping-surface trick out entirely.** `pending-message.tsx` keeps its copy; deduping that token usage is not this change.

## Risks / Trade-offs

- [Visual density on the new-chat surface] → The header row now always shows small controls; accepted per discussion — consistency across tab states outweighs the diluted centered composition.
- [Test churn] → `index.test.tsx` assertions pin the strip's existence and a single `data-window-project-title`; they flip to expecting the header copy in that state. Contained in that one file.

## Migration Plan

Renderer-only, no data or migration. Rollback is a revert.

## Open Questions

None.
