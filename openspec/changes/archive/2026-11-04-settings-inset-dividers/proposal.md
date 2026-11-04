# Proposal

## Why

Settings row lists currently mix three coexisting visual forms: Card + full-width Separator rows (session/language/appearance/theme-palette), bare `div` with `divide-y rounded-lg border` (agent capability lists, plugin pages, marketplace pages), and one-card-per-entry lists (projects, providers, permission radio cards). Divider lines run edge-to-edge across the card, divider colors (`border` vs `border-in-card`) and row paddings (`px-4` vs `px-5`) disagree between forms, and the overall look trails the card-with-inset-divider style used by mainstream desktop settings apps.

## What Changes

- Add a shared settings row-list component pair (list container + row): container `rounded-lg border`, rows automatically separated by a divider that is inset on both ends (aligned with the row's horizontal padding), colored `bg-border-in-card`; unified horizontal row padding; two row densities (preference row `min-h-20` with title+description, list row `min-h-14` compact); built-in whole-row hover highlight.
- Migrate every row-style settings list to the shared component:
  - Card + Separator form: session, language, appearance preferences, theme palette.
  - Bare `divide-y` form: agent skills / MCP / workflows / hooks / subagent rows, plugin list, plugin detail sections, marketplace list/detail.
- Reshape per-entry-card lists into one big card with rows: projects list, providers list, permission radio group.
- Remove hand-written row separators (`Separator` / `divide-y`) from individual pages.

Out of scope: non-row elements (plugin detail / marketplace info boxes, theme preview card, provider editor form) keep their current look; no behavioral contract changes (row content, actions, navigation) — this change is presentation-only.

## Capabilities

### New Capabilities

- `settings-list-presentation`: Owns the shared presentation of settings row lists — the card container, inset dividers, row densities, row padding, and row hover highlight — and which settings lists adopt it.

### Modified Capabilities

(none — the behavior contracts in `agent-capability-settings`, `plugin-settings-pages`, and `settings-detail-navigation` are unchanged; visual containers are owned by the new capability)

## Impact

- New shared component(s) under `src/renderer/pages/settings/components/`; ~15 page files touched across `src/renderer/pages/settings/`.
- Visual regression risk in light theme: agent/plugin lists' divider color lightens (`border` → `border-in-card`).
- Existing tests that query list container structure (divide-y containers, per-row Cards) may need selector updates.
- Per project convention, a `prototype.html` demo accompanies this change for visual review before apply.
