# Proposal

## Why

The subagent editor currently opens inline above the list on the same page, so opening it collapses the list context and there is no navigational indication of where the user is. A second-level detail page with a breadcrumb gives the editor its own space and a visible path back to the list, matching the navigation pattern users expect from a settings hierarchy.

## What Changes

- Turn the subagent editor into a second-level detail page within the Subagents settings category: clicking a custom subagent's chevron or the Add action switches the content pane to the editor page instead of rendering the editor inline above the list.
- Add a breadcrumb bar at the top of the content region (right of the settings sidebar, left-aligned with the title area, outside the centered content container) shown only on the detail page: `Subagents > <name>` for an existing subagent, `Subagents > New subagent` for creation.
- The detail page keeps its own h1 title (the subagent name or "New subagent") with a description line below: "Fill in the name, tools and system prompt of the subagent. Saving returns you to the list." (localized).
- Breadcrumb root and unsaved-changes guard: navigating back via the breadcrumb root, the sidebar, or Cancel while the form has unsaved changes opens a confirmation dialog; confirming discards and returns to the list. Saving (or leaving with no changes) returns to the list directly. Esc and the sidebar Back action keep closing the whole settings page without this confirmation.
- Remove the inline editor render path from the list page.
- Prototype validated the layout: `prototype.html` in this change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-capability-settings`: The Subagent management requirement changes — the editor moves from an inline block to a second-level detail page with a breadcrumb header, an on-page title/description, and an unsaved-changes confirmation on list-bound navigation.

## Impact

- `src/renderer/pages/settings/index.tsx` — hosts the detail-page state (or receives it from the subagent settings component) and renders the breadcrumb bar above the scrollable content region.
- `src/renderer/pages/settings/components/agent-subagent-settings.tsx` — drops the inline editor; row chevron and Add now switch to the detail page.
- `src/renderer/pages/settings/components/subagent-editor.tsx` — becomes the detail page body (title, description, form, footer); gains dirty tracking.
- i18n catalogs (`src/renderer/i18n/catalogs/settings.ts`) — new keys for the breadcrumb root fallback, "New subagent", the description line, and the confirmation dialog.
- No main-process or IPC changes; no data-format changes.
