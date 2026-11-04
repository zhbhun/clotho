# Tasks

## 1. Shared list components

- [x] 1.1 Create `pages/settings/components/settings-list.tsx` with `SettingsList` (card container `rounded-lg border overflow-hidden gap-0`, renders `mx-5 h-px bg-border-in-card` dividers between `SettingsRow` children, passes other children through untouched) and `SettingsRow` (`variant: 'preference' | 'compact'`, `min-h-20 px-5 py-4` / `min-h-14 px-5`, built-in full-width hover via `bg-muted/40`, `Field`-based content slots); verify `npm run check` passes with the new file.

- [x] 1.2 Migrate the four Card+Separator pages to the shared list (session, language, appearance preferences, theme palette rows): replace `Card`+`Separator`/`Fragment` scaffolding with `SettingsList`/`SettingsRow`; verify each page renders identically (rows, single card, inset dividers) and affected co-located tests pass.

## 2. divide-y list migration

- [x] 2.1 Migrate agent capability lists (skills, MCP servers, workflows, hooks, subagent rows) from `divide-y rounded-lg border` to `SettingsList`/`SettingsRow` compact variant; verify each list renders with inset `border-in-card` dividers and affected `agent-*.test.tsx` pass.

- [x] 2.2 Migrate plugin pages (installed-plugin list rows, plugin detail section lists) and marketplace pages (marketplace list, marketplace detail plugin list) to the shared list; verify inset dividers and affected tests pass.

## 3. Per-entry-card reshaping

- [x] 3.1 Reshape projects list from per-entry Cards into one `SettingsList` with a compact row per project (icon, name, path, hover-visible edit/delete via row-level group); verify edit/delete actions still appear on hover and `project-settings.test.tsx` passes.

- [x] 3.2 Reshape providers list from per-entry `ProviderListCard` into rows in one `SettingsList` (name, model-count badge, usage badges, hover-visible actions); verify edit/delete/refresh actions and `provider-settings.test.tsx` pass.

- [x] 3.3 Reshape permission radio group into rows inside one `SettingsList` (RadioGroup keeps semantics; rows lose per-row card chrome, keep icon tile, check indicator); verify selection still saves via `saveDefaultPermissionMode` and affected tests pass.

## 4. Cleanup and visual verification

- [x] 4.1 Remove now-unused hand-written separators/row scaffolding (`Separator` imports, `divide-y` wrappers, per-row Card usage) left behind in migrated files; verify `npm run lint` on changed files and `npm run check` pass.

- [x] 4.2 Visual pass over all migrated categories in `npm run debug` (CDP 3367, reuse existing instance if running): confirm both-ends divider inset, `border-in-card` color, aligned padding across lists, row hover, both themes; confirm non-row elements (info boxes, theme preview, editor forms) unchanged.

## Workflow follow-up

- Move `prototype.html` from a temporary dir into `openspec/changes/settings-inset-dividers/prototype.html` before propose is finalized (per project convention for UI changes).
- Archive the change via `/openspec-archive-change` after apply completes.
