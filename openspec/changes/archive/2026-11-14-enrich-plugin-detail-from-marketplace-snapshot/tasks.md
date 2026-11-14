# Tasks

## 1. Main process: local source readers

- [x] 1.1 Add `marketplace-snapshot.ts` under `src/main/claude/agent-config/`: resolve a marketplace's snapshot path (`known_marketplaces.json` `installLocation`, fallback `~/.claude/plugins/marketplaces/<name>`), parse `.claude-plugin/marketplace.json` defensively, and return the entry for a plugin name (author, category, homepage, displayName, version, keywords). Missing/unreadable files return `undefined`; test with fixture files.
- [x] 1.2 Add `catalog-cache.ts`: locate and parse `~/.claude/plugins/plugin-catalog-cache.json`, return a plugin's component lists (skills/commands/agents/mcpServers/hooks → name + description when present) by `<name>@<marketplace>` id; memoize by file mtime. Missing/unreadable/shape-mismatched cache returns `undefined`; test with fixtures.

## 2. Main process: detail assembly and catalog feed

- [x] 2.1 Extend `listMarketplacePlugins` to keep the CLI's `version`; extend `AgentMarketplacePlugin` and `CatalogEntry` with optional `version` (renderer passthrough).
- [x] 2.2 Extend `AgentPluginDetails` (src/shared/rpc.ts): optional `displayName`, `commands`, `hooks`; document the four-source precedence in the interface comment.
- [x] 2.3 Rewire `getPluginDetails` to join marketplace snapshot → catalog cache → install manifests → installed record (later wins): fill author/category/homepage/displayName/version/keywords and component lists for uninstalled plugins; keep silent degradation when a source is absent. Update `plugins.test.ts` / `plugin-details` tests with snapshot + cache fixtures.

## 3. Renderer: sectioned detail layout (variant A)

- [x] 3.1 Extend shared detail sections (plugin-detail-page.tsx): add Commands and Hooks sections with kind icons and counts; omit empty sections; component rows keep name + one-line description (expand on click optional, per prototype).
- [x] 3.2 Change the Info block to per-row omission (already the pattern) and add rows: homepage (link-styled, opens via `appOpenLink`), category verbatim, install count; use `displayName` for the title when present.
- [x] 3.3 Rework `InstallPluginDetailPage` (install-page.tsx) to the sectioned layout: component sections before Info, per-row Info omission, Install button / Installed badge unchanged. Add homepage handling consistent with D7.
- [x] 3.4 Update renderer tests: install detail renders catalog-cache components for uninstalled entries; directory-only entry shows no component sections; snapshot-filled Info rows.

## 4. Verification

- [x] 4.1 `npm run check`; lint/format changed files; run affected module tests (`plugins.test.ts`, detail/catalog renderer tests).
- [x] 4.2 `npm run debug`: open Marketplace → detail for an uninstalled official plugin (e.g. stripe) — component sections and snapshot fields render; open a directory-only entry — thin detail, no sections; installed plugin detail unchanged in shape. Stop the app afterwards.
