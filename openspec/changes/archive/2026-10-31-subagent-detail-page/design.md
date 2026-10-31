# Design

## Context

The settings page (`src/renderer/pages/settings/index.tsx`) is a fullscreen dialog: a sidebar of categories plus one scrollable content region whose header renders the category name as an `<h1>` (`category.labelKey`). The Subagents category renders `AgentSubagentSettings`, which currently holds `draft`/`fileBeingEdited` state and renders `SubagentEditor` inline above the list. The workbench already has a breadcrumb precedent (`src/renderer/pages/workbench/session/subagent-breadcrumb.tsx`) built on `@/shadcn/breadcrumb`. Prototype validated the layout in `prototype.html` (breadcrumb bar above the content, centered container below, confirm dialog).

## Goals / Non-Goals

**Goals:**
- Detail page replaces the inline editor inside the Subagents category, with breadcrumb bar in the content region top.
- Unsaved-changes confirmation covers all list-bound paths: breadcrumb root, sidebar category switch, Cancel.
- Keep Esc / sidebar Back closing the whole settings page, no confirmation.

**Non-Goals:**
- No routing/URL state for settings views (dialog has no router).
- No change to other categories, the main process, IPC, or the file format.
- No dirty-checking on Esc or Back (decided: they close settings outright).

## Decisions

- **D1 — Detail-page state lives in a small store inside the settings page module, not `index.tsx` component state.** The breadcrumb bar renders in `SettingsPageContent` (it spans the content region above the scroll area, outside the centered container), but only the subagents category has a detail view. Instead of threading subagent-specific state through generic settings props, export a `useSubagentDetail` store (zustand, matching project idiom) from `agent-subagent-settings.tsx` (or a sibling `subagent-detail-store.ts`): `{ view: 'list' | { kind: 'detail', file: string | null } }`. `SettingsPageContent` reads it to (a) swap the header for the breadcrumb bar and (b) conditionally render the detail view; `AgentSubagentSettings` writes it. Component-local state would force prop-drilling through `SettingsCategory`; a store keeps both ends decoupled and survives the sidebar's `hidden`-based category mounting (all categories stay mounted, so store state persists when the user toggles away and back).
- **D2 — Breadcrumb bar placement: inside `SidebarInset`, above `TransientScrollArea`.** The bar is a fixed flex row (`px-6 pt-*`) left-aligned with the title area; the scrollable content keeps the centered `APP_CONTENT_CONTAINER_CLASS` container with its own h1. Alternative considered: render the breadcrumb inside the scroll container — rejected, it would scroll away and sit inside the centered container, contradicting the decided layout.
- **D3 — Dirty tracking in `SubagentEditor` via a baseline snapshot.** Capture `JSON.stringify(form)` (or a field-wise comparison) when the editor mounts; `isDirty = current !== baseline`. Expose it upward through the store (`setDirty`) so the breadcrumb/sidebar guard can read it without prop threads. Cancel and breadcrumb root share one `requestLeave()` helper: dirty → open confirm dialog; clean → `view = 'list'`.
- **D4 — Sidebar category switch while dirty: confirm, then stay on Subagents.** Confirming discard returns to the list but does NOT activate the clicked category (matches prototype; simplest correct behavior — the user can click the category again). Declining keeps everything as-is. The guard intercepts the `setCategoryId` call in `SettingsPageContent` only when the subagent detail store reports an open detail view with `isDirty`.
- **D5 — Confirmation dialog uses the existing `Dialog` + `DeleteConfirmButton`-style pattern**, not `window.confirm`: a small `AlertDialog`-style dialog ("Discard changes?" / body naming the subagent / Keep editing + Discard). i18n keys under `settings.agent.subagent.discard*`.
- **D6 — Editor body reuse: `SubagentEditor` keeps its form but gains the page header** (h1 title + description line) and loses the bordered-card wrapper; the detail page fills the content container. Name/description/advanced/prompt field order and all field semantics are unchanged from the adopted spec.

## Risks / Trade-offs

- [Store shared between index and category component creates import coupling both directions] → Store module sits beside the components (`pages/settings/components/`), imports nothing from `index.tsx`; `index.tsx` imports only the store hook.
- [Dirty check misses advanced-fields internal state (mode/checkedTools derive from `form.tools`)] → Baseline compares serialized `AgentSubagentConfig` only; derived UI state resets from `form`, so no false negatives.
- [User switches category with clean detail open, then re-opens Subagents] → Detail view persists (store survives `hidden` toggle); acceptable — matches "editor stays open until left", and Cancel/breadcrumb still work. If undesired later, reset store on category change.
- [Breadcrumb width overflow with long subagent names] → Truncate the leaf with `max-w-*` + `truncate`, same as the workbench breadcrumb.

## Migration Plan

Single renderer-side change; no data migration. Rollback = revert the commit.

## Open Questions

(none)
