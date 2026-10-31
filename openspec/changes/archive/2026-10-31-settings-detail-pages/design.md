# Design

## Context

The settings page (`src/renderer/pages/settings/index.tsx`) is a fullscreen dialog whose content pane switches by category. Today three editing interactions coexist:

- Subagents: a second-level detail page. State lives in `subagent-detail-store.ts` (zustand: `view: list | detail`, `isDirty`, `requestLeave`/`confirmLeave`/`cancelLeave`). The breadcrumb bar renders in `index.tsx` under an `isSubagentDetailOpen` condition, with the category `h1` hidden while the detail page shows its own. `DiscardChangesDialog` in `index.tsx` handles the dirty guard.
- Providers and projects: dialogs (`ShortcutDialog` in `provider-settings.tsx`; `ProjectDialog` in `pages/workbench/components/project-dialog.tsx`, opened by the workbench via `onCreateProject`/`onEditProject` callbacks passed down to `SettingsPage`).
- Hooks, MCP, workflows: an inline editor block rendered above the list when `draft` state is set.

The project dialog is shared by two entry points: the settings page and the workbench sidebar ("add project"). Only the settings-page entry changes; the workbench entry stays a dialog.

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- One detail-page mechanism shared by all six editors (providers, projects, subagents, hooks, MCP, workflows).
- Uniform breadcrumb bar, dirty guard, and leave rules across detail pages.
- Keep the workbench "add project" dialog working, sharing the form body with the settings-page detail page.

**Non-Goals:**

- Redesigning any editor's form fields (forms move as-is, except where the footer row must change).
- Changing deletion flows or their confirmation dialogs.
- Router-style navigation or URL state; the settings page keeps its internal state approach.
- The default-model card and its role pickers (`model-role-mapping` spec) stay inline with inline save.

## Decisions

### D1: Generalize the existing store instead of adding a navigation library

Rename/evolve `subagent-detail-store.ts` into a shared `settings-detail-store.ts` holding one detail view at a time: `{ categoryId, file | null }` plus the existing `isDirty` / leave-request protocol. Only one detail page can be open at a time — opening one implicitly closes others, which matches the current single-content-pane model and avoids per-category stacks.

Alternatives considered: per-category store instances (rejected: the breadcrumb bar and discard dialog in `index.tsx` need one source of truth, and two detail pages can never be open simultaneously); a route-based history stack (rejected: overkill for one level of depth).

The store keeps its current protocol shape (`requestLeave` → maybe `isLeavePending` → `confirmLeave`/`cancelLeave`, `backToList`) so the subagent migration is mostly mechanical.

### D2: Breadcrumb bar and discard dialog render from shared state in `index.tsx`

`index.tsx` reads the detail store once: when a detail view is open, render the breadcrumb bar (root = the category's localized label, leaf = editor-provided leaf text) and hide the category `h1`; the detail content is the active category's registered detail component. The `DiscardChangesDialog` instance becomes generic (title/description take the leaf name). The subagent-specific `isSubagentDetailOpen` condition and the special-cased breadcrumb disappear.

Detail editors self-register their breadcrumb leaf via the store (e.g. `openDetail({ categoryId, leaf })`, updatable with `setLeaf`), keeping `index.tsx` free of per-editor knowledge.

### D3: Category components own their detail content; `index.tsx` keeps switching by category

Each convertible category component renders either its list or its detail based on the store, the same way `AgentSubagentSettings` already branches on `view.kind`. `index.tsx` does not gain per-editor detail components; it only hosts the shared breadcrumb/dialog chrome. This keeps the ~300-line coupling budget per category and preserves the current `SettingsCategory` error boundaries (each category keeps its own boundary around list *and* detail).

### D4: Project form body extracted; two shells share it

`ProjectDialog`'s form body (name, path picker, icon picker, additional directories, validation, save logic) moves to a shared component under `src/renderer/components/project-form.tsx` with props for initial project and `onSaved`. Two shells consume it:

- Workbench sidebar: the existing `AppDialog` shell — unchanged behavior.
- Settings page: a detail page — h1 + description + form + footer row (Cancel left of Save), driven by the detail store.

This satisfies the "promote to root-level only after multi-page reuse" rule. The `onCreateProject`/`onEditProject` callbacks from the workbench become no-ops for the settings page entry (the settings page owns its own detail state); the workbench keeps its own dialog state.

### D5: Dirty tracking per editor, uniform guard

Editors that already derive state from a single draft object (subagent editor, provider editor via `useProviderDraft`) compare against a baseline snapshot, like the subagent editor's `JSON.stringify(form) !== baselineRef.current`. The hook/MCP/workflow editors and the project form get the same one-effect pattern: snapshot the initial draft, report dirtiness to the store via `setDirty`. The guard behavior (which paths confirm, which do not) is defined once by the store + generic dialog, not per editor.

Alternative considered: field-level change listeners (rejected: more wiring, no behavioral gain).

### D6: Footer row becomes the editors' save/cancel location

Dialog footers and inline save buttons move into a shared footer row layout inside each detail page (Cancel + Save right-aligned; danger Delete left-aligned where it exists — subagents already have this). The provider dialog's save button and the inline editors' save/cancel buttons relocate; save logic is untouched.

## Risks / Trade-offs

- [Focus management regressions] The provider dialog currently restores focus to its trigger via `editorTriggerRef` / `finalFocus`; the detail page has no trigger to restore. → Drop trigger restoration for detail pages; focus the detail page's h1/first field on open, and rely on the existing settings-page focus contract on close.
- [Losing dialog ergonomics for short edits] A detail page is heavier than a dialog for the workflow editor's two fields. → Accepted deliberately: uniformity beats per-editor optimization, per the user's decision to convert all editors.
- [Shared-form extraction churn] Moving `ProjectDialog`'s body touches save logic and its tests. → Extract the body verbatim first (pure move, dialog still works), then add the detail-page shell; two commits, tests updated at each step.
- [Spec churn on subagent requirements] The subagent breadcrumb/dirty-guard text in `agent-capability-settings` is detailed and locale-specific. → Move the generic mechanics to `settings-detail-navigation` and keep the subagent spec pointing at the shared behavior instead of restating it; only the subagent-specific copy (breadcrumb leaf values, description line) stays in its requirement.

## Migration Plan

1. Generalize the store + breadcrumb + discard dialog in `index.tsx`; migrate subagents onto it with zero behavior change (tests confirm).
2. Convert providers; convert hooks/MCP/workflows.
3. Extract the project form body; convert the settings-page project entry; keep the workbench dialog on the shared form.
4. Specs updated as deltas in this change; archive syncs them.

Rollback: each step is an independent conversion; reverting the last step restores the previous interaction without breaking others.

## Open Questions

None.
