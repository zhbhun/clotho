# Proposal

## Why

The Plugins settings page stacks installed plugins, the marketplace catalog, and marketplace management into one long scrolling view with duplicated section titles, making plugin management hard to navigate as the catalog grows (3,900+ entries). The user needs a page-per-concern structure: installed plugins, marketplaces, adding a marketplace, and browsing/installing plugins each get their own page, with detail pages for individual plugins and marketplaces.

## What Changes

- Restructure the Plugins settings category into multi-level pages on top of the shared settings detail navigation:
  - **Plugins page (top level)**: installed plugin list only. Header actions: `Install` button + a `⋯` overflow menu (Refresh all, Marketplaces).
  - **Plugin detail page (level 2)**: opens from a row chevron. Shows description, Skills, MCP servers, Subagents, and an Info block (author, category, version, marketplace, root path, installed at). Top-right actions: `⋯` menu with Enable/Disable and Uninstall.
  - **Marketplaces page (level 2)**: registered marketplace list. Header actions: `Add` button + `⋯` menu (Refresh all). Rows open a marketplace detail page (no per-row actions).
  - **Marketplace detail page (level 3)**: source info (type, source), plus that marketplace's plugin list with Install actions; header has Refresh and a `⋯` menu with Remove marketplace.
  - **Add marketplace page (level 3 under Marketplaces)**: form with Source and a conditional Git ref field (shown only while the source looks like a git repo; appended to the source as `#ref`; hidden for local folder paths).
  - **Install plugin page (level 2, parallel to Marketplaces)**: three tabs — Public (Anthropic plugin directory), Community (added github/git marketplaces), Personal (local-directory marketplaces) — with a search box at the right of the tab row. Plugin entries render as a borderless two-column grid (hover highlight, borderless `+` install button; installed entries show an Installed badge). Clicking an entry opens an install detail page (level 3) with the same layout as plugin detail but an Install button.
- Plugin rows on the Plugins page drop the version/scope badges; the second line shows `scope · marketplace · version` as plain subtle text.
- New `getAgentPluginDetails` RPC: the main process reads the plugin's `installPath` manifests (`plugin.json`, `skills/`, `agents/`, `.mcp.json`) and the installed-plugin record to assemble detail data (description, author, homepage, skills, MCP servers, subagents, root path, installed at).
- Marketplace detail and the Install page's Community/Personal tabs join the available-plugin catalog with marketplace source types, so entries can be classified by their marketplace's source (`directory` → Personal, git/github → Community, `anthropic-plugin-directory` → Public).
- **BREAKING** (UI-only, internal): the Plugins settings view's single-page layout with inline catalog expansion is replaced by the page structure above; the `browseCatalog` toggle behavior is removed.

## Capabilities

### New Capabilities

- `plugin-settings-pages`: the Plugins settings page structure — installed-plugin list page, plugin detail page, marketplace list/detail pages, add-marketplace form, install page with source tabs — and their navigation, actions, and data assembly.

### Modified Capabilities

- `agent-capability-settings`: the "Plugin management" requirement's UI presentation is restructured from the single-page sections into the paged structure owned by `plugin-settings-pages`; the CLI-backed management contract (list/install/enable/marketplace commands, restart hints) is unchanged and stays in this spec.

## Impact

- `src/renderer/pages/settings/components/agent-plugin-settings.tsx` — rewritten into page components (list, detail, market, market detail, add, install, install detail) following the `agent-subagent-settings` detail-page pattern.
- `src/renderer/pages/settings/components/settings-detail-store.ts` — the detail view needs a third level (Add / marketplace detail under a second-level page) or an equivalent local representation; `settings-detail-navigation` behavior (one page at a time, breadcrumb, dirty guard) must hold.
- `src/main/claude/agent-config/plugins.ts` + `claude-service.ts` + `src/shared/rpc.ts` + preload — new `getAgentPluginDetails` handler and types; marketplace listing gains source-type data for tab classification.
- `src/renderer/i18n/catalogs/settings.ts` — new keys for pages, menus, tabs, and detail labels in all three languages.
- Prototype: `openspec/changes/plugin-settings-pages/prototype.html` (captured from the explore session, rev 4).
