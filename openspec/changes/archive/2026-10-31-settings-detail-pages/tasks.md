# Tasks

## 1. Shared detail-page mechanism (subagents migrate, no behavior change)

- [x] 1.1 Generalize `subagent-detail-store.ts` into a shared detail store keyed by category (`{ categoryId, file | null }`, `leaf`, `isDirty`, leave protocol); keep the subagent behavior identical. Verify: `npm run test -- agent-subagent-settings.test.tsx` and `npm run check` pass.
- [x] 1.2 Render the breadcrumb bar and the generic `DiscardChangesDialog` in `settings/index.tsx` from the shared store (root = category label, leaf = store leaf); hide the category `h1` while any detail page is open; remove the subagent-specific condition. Verify: `npm run test -- index.test.tsx` passes; subagent breadcrumb scenarios behave as before.
- [x] 1.3 Add per-editor dirty tracking helpers (baseline-snapshot pattern from `subagent-editor.tsx`) for reuse by the converted editors. Verify: `npm run check`; helper covered by one of the editor tests in later groups.

## 2. Provider editor to detail page

- [x] 2.1 Move the provider editor from `ShortcutDialog` to a detail page: store-driven open/close, breadcrumb leaf (provider name or localized `New provider`), h1 + description header, form unchanged, footer row with Cancel/Save. Verify: `npm run test -- provider-settings.test.tsx` updated and passing.
- [x] 2.2 Add dirty tracking to the provider editor (baseline vs. `useProviderDraft` state) wired to the shared guard. Verify: test — editing a field then clicking the breadcrumb root opens the discard dialog; clean state leaves directly.
- [x] 2.3 Drop trigger-focus restoration for the detail page; focus the page title/first field on open. Verify: manual check via `npm run debug` CDP, or skip if covered by RTL focus assertions.

## 3. Hooks / MCP / Workflow editors to detail pages

- [x] 3.1 Convert `agent-hook-settings.tsx`: inline `HookEditor` block becomes a detail page (list page shows rows only); dirty tracking + shared guard. Verify: `npm run test -- agent-hook-settings.test.tsx` updated and passing.
- [x] 3.2 Convert `agent-mcp-settings.tsx` the same way. Verify: `npm run test -- agent-mcp-settings.test.tsx` updated and passing.
- [x] 3.3 Convert `agent-workflow-settings.tsx` the same way. Verify: `npm run test -- agent-workflow-settings.test.tsx` updated and passing.

## 4. Project editor: shared form body, settings detail page

- [x] 4.1 Extract `ProjectDialog`'s form body (name, path picker, icon, additional directories, validation, save) into a shared `src/renderer/components/project-form.tsx`; rewire the workbench dialog to it as a pure move. Verify: existing dialog behavior unchanged; `npm run test -- project-dialog` tests (if any) and `npm run check` pass.
- [x] 4.2 Add the project detail page in the settings page using the shared form (breadcrumb leaf = project name or localized `New project`, footer Cancel/Save, dirty guard); settings-page `onCreateProject`/`onEditProject` open the detail state instead of the dialog; workbench sidebar keeps the dialog. Verify: `npm run test -- project-settings.test.tsx` updated and passing.
- [x] 4.3 Clean up the now-unused callback path if the settings page no longer needs `onCreateProject`/`onEditProject` props. Verify: `npm run check` and `npm run lint` on changed files pass.

## 5. i18n and polish

- [x] 5.1 Add/adjust copy for new detail pages (breadcrumb create labels, page descriptions, discard dialog subjects) in en, zh-CN, zh-TW. Verify: `npm run lint` on locale files; keys resolve in all three locales.

## 6. Verification

- [x] 6.1 Run affected test files (`npm run test -- settings workbench/components`) and `npm run check`. Verify: all pass.
- [x] 6.2 Manual pass over all six editors in the running app: open, edit dirty, breadcrumb/category/Cancel guard, save, Esc. Verify via `npm run debug` CDP checks; stop the app afterward.

## Workflow follow-up

- Archive via `/openspec-archive-change` when tasks complete (syncs `settings-detail-navigation` and the `agent-capability-settings` deltas into `openspec/specs/`).
