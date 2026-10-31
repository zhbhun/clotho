# Proposal

## Why

The subagents category already edits through a second-level detail page with a breadcrumb, and it feels better than dialogs for long forms. The other editors are inconsistent: providers and projects open dialogs inside the settings page, while hooks, MCP servers, and workflows expand an inline block on the list page. This change makes the page-switch pattern the single editing interaction across the settings page.

## What Changes

- Extract the subagent-specific detail-page mechanics (second-level view state, breadcrumb bar, unsaved-changes guard) in the settings page into a shared mechanism that any category can use.
- Convert the provider editor from a `ShortcutDialog` into a detail page (Add provider / edit a provider) with breadcrumb navigation.
- Convert the project editor inside the settings page from the shared `ProjectDialog` into a detail page, while the workbench sidebar keeps opening the same dialog for adding a project; the dialog's form body is extracted so both entry points share one form.
- Convert the hooks, MCP, and workflow editors from inline blocks on the list page into detail pages; list pages become pure lists again.
- Add the unsaved-changes confirmation (dirty guard) to all detail pages that previously lacked it: providers, projects, hooks, MCP, workflows. Behavior matches the existing subagent guard: breadcrumb root, sidebar category, and Cancel confirm before discarding; Esc and the sidebar Back action close the whole settings page without confirming.
- Keep deletion confirmation dialogs, skills/plugins (no editors), and the default-model card unchanged.

## Capabilities

### New Capabilities

- `settings-detail-navigation`: The settings page's second-level detail-page navigation — the breadcrumb bar above the content, the shared detail-view state, the dirty guard on list-bound navigation, and which editors open as detail pages instead of dialogs or inline blocks.

### Modified Capabilities

- `agent-capability-settings`: The MCP, hook, and workflow editors open as second-level detail pages instead of inline blocks on the list page; the subagent detail page's breadcrumb and unsaved-changes requirements move to (and are referenced from) `settings-detail-navigation`.

## Impact

- `src/renderer/pages/settings/index.tsx` — breadcrumb bar and discard dialog generalize from the subagent-specific condition to shared detail state.
- `src/renderer/pages/settings/components/subagent-detail-store.ts` — generalized into a per-category detail store (or a store keyed by category).
- `src/renderer/pages/settings/components/provider-settings.tsx` + `src/renderer/components/model-configuration/` — editor container moves from dialog to detail page; form unchanged.
- `src/renderer/pages/workbench/components/project-dialog.tsx` — form body extracted to a shared component; dialog shell stays for the workbench sidebar entry.
- `src/renderer/pages/settings/components/agent-{hook,mcp,workflow}-settings.tsx` — inline editors become detail pages.
- i18n files — new copy for breadcrumb leaves and detail-page descriptions per editor.
- Tests next to the affected components.
