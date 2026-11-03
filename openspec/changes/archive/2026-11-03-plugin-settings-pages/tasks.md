# Tasks

## 1. Main-process detail data

- [x] 1.1 Add `AgentPluginDetails` types to `src/shared/rpc.ts` (name, description, author, homepage, category, version, marketplace, scope, installPath, installedAt, enabled; skills/MCP/subagent component lists with name + description) plus the `getAgentPluginDetails` request/response contract.
- [x] 1.2 Implement `getPluginDetails` in `src/main/claude/agent-config/plugins.ts`: resolve `installPath` from a fresh `claude plugin list --json`, read `.claude-plugin/plugin.json`, `skills/*/SKILL.md` frontmatter, `agents/*.md` frontmatter, and `.mcp.json`; fall back to installed-record fields and empty sections when files are missing or unreadable.
- [x] 1.3 Add the catalog fallback path for uninstalled entries (available-catalog fields, components only from a locally installed same-id copy) and a not-found error.
- [x] 1.4 Wire `getAgentPluginDetails` into `claude-service.ts`, preload, and the renderer service (`src/renderer/services/claude/agent-config.ts`).

## 2. Navigation store: third level

- [x] 2.1 Extend `SettingsDetailView` in `settings-detail-store.ts` so a Plugins-category page can open a third level (Add marketplace, marketplace detail, install detail) while keeping the existing two-level shape for other categories.
- [x] 2.2 Update the breadcrumb bar in `settings/index.tsx` to render one clickable segment per level, rooted at the category name; keep the bar hidden on top-level list pages.
- [x] 2.3 Make list-bound leave (`requestLeave`/`backToList`) walk one level up within the category when a third level is open, gated by the existing dirty check; extend `settings/index.test.tsx` for the three-level flow.

## 3. Plugins page (installed list)

- [x] 3.1 Rewrite the top-level view of `agent-plugin-settings.tsx` as the installed list page: `Installed N items` header, `Install` button, `⋯` DropdownMenu (Refresh all, Marketplaces).
- [x] 3.2 Restyle rows: name line + `scope · marketplace · version` subtle second line, switch then chevron at the right, no delete button; chevron opens the plugin detail page.
- [x] 3.3 Update `agent-plugin-settings.test.tsx` for the new header actions and row layout.

## 4. Plugin detail page

- [x] 4.1 Build `plugin-detail-page.tsx`: title + description, Skills / MCP servers / Subagents sections, non-collapsed Info block (author, category, version, marketplace, root path, installed at), data via `getAgentPluginDetails`.
- [x] 4.2 Add the `⋯` menu with Enable/Disable (state-matched label, optimistic toggle + restart hint) and destructive Uninstall (confirm + restart hint + return to list).
- [x] 4.3 Cover detail rendering and menu actions in tests.

## 5. Marketplaces pages

- [x] 5.1 Build the Marketplaces list page: registered count header, `Add` button, `⋯` menu (Refresh all); rows show `source-type · source` and a chevron only — no per-row refresh/delete.
- [x] 5.2 Build the marketplace detail page: Info block (type, source), that marketplace's plugin list (name, description, install count, Installed badge / Install button), header Refresh for this marketplace, `⋯` menu with confirmed Remove marketplace returning to the list.
- [x] 5.3 Build the Add marketplace page: Source field, conditional Git ref field (hidden for empty/local-path input, hint explains `#ref`), compose `source#ref` on submit, Cancel/Save with the shared dirty guard, error toast on failure.
- [x] 5.4 Add i18n keys for all three pages (en/zh-CN/zh-TW) and tests for classification of rows and the ref-visibility rule.

## 6. Install plugin pages

- [x] 6.1 Build the Install page: Public/Community/Personal tabs via `@/shadcn/tabs`, search input at the row's right end, tab classification joined from marketplace source types (D5), no refresh action.
- [x] 6.2 Render the borderless two-column grid: name + `N installs · description` (marketplace fallback), hover highlight, borderless `+` install button, Installed badge; wire install to the CLI + restart hint.
- [x] 6.3 Build the install detail page (breadcrumb under Install plugin): detail layout per D4 with the Install primary button / Installed badge.
- [x] 6.4 Add i18n keys (tabs, search placeholder, install count) and tests for tab filtering, search, and the grid actions.

## 7. Cleanup and validation

- [x] 7.1 Remove the dead single-page code paths (inline catalog toggle, add-marketplace input on the list page, per-row marketplace actions) and unused i18n keys.
- [x] 7.2 Run `npm run check`, lint/format on changed files, and the affected test files; verify the full flow against the prototype via `npm run debug` CDP checks.
