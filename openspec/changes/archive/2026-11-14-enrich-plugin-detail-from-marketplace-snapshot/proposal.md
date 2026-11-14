# Proposal

## Why

The plugin detail pages (Plugin detail and Install detail) show far less information than the data actually available on the machine. For uninstalled catalog entries — the common case in the Marketplace Plugins tab — the main process only maps five CLI fields (`pluginId`, `name`, `description`, `marketplaceName`, `installCount`), so author, category, homepage, and version are missing even though the CLI's `--available` output carries `version`, and full marketplace manifests (author, category, homepage, displayName, tags) sit unread in `~/.claude/plugins/marketplaces/<m>/.claude-plugin/marketplace.json`. For the 315 official plugins, the CLI's catalog cache (`plugin-catalog-cache.json`) even holds component lists (skills/commands/agents/MCP/hooks) that would let an uninstalled plugin show real component sections instead of empty ones.

## What Changes

- The main process enriches plugin detail with a marketplace-snapshot lookup: for a catalog entry (or any plugin), read the registered marketplace's local manifest snapshot under `~/.claude/plugins/marketplaces/` and fill `author`, `category`, `homepage`, `displayName`, `version`, and `keywords` when the CLI fields lack them. Snapshot reads are local-file only, no network.
- The main process enriches plugin detail with catalog-cache components: for plugins listed in the CLI's catalog cache (official marketplace), component lists (skills, commands, agents, MCP servers, hooks) are returned even when the plugin is not installed. Component names come with short descriptions where the cache provides them; entries stay name-only otherwise.
- The install detail page adopts the sectioned layout validated in the prototype (variant A): component sections with per-kind icons and counts — Skills, Commands, Subagents, MCP servers, Hooks — followed by an Information block whose rows (developer, category, version, homepage, install count, marketplace) are omitted individually when unknown.
- `listMarketplacePlugins` (the catalog feed) stops dropping the CLI's `version` field so catalog entries carry it through to detail and can display it.
- Directory-only entries (no snapshot, no cache, not installed) keep the thin detail: description, version, marketplace, and the repo/homepage link when derivable — their data ceiling is the directory index itself, documented as a non-goal to fetch remotely.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `plugin-settings-pages`: the Plugin detail page and Install plugin detail page requirements change — detail data now includes marketplace-snapshot and catalog-cache enrichment (new fields and component lists for uninstalled plugins), and the install detail page adopts the sectioned component layout with per-row field omission in the Info block.

## Impact

- `src/main/claude/agent-config/plugin-details.ts` — assemble detail from marketplace snapshot + catalog cache in addition to install-path manifests.
- `src/main/claude/agent-config/plugins.ts` — `listMarketplacePlugins` keeps `version`.
- `src/shared/rpc.ts` — `AgentPluginDetails` gains optional fields (category source widening, `displayName`, homepage already exists, components gain `commands`/`hooks` groups); `AgentMarketplacePlugin` gains `version`.
- `src/renderer/pages/settings/components/plugin-detail-page.tsx` — shared section components gain Commands/Hooks sections; Info block renders per-row omission.
- `src/renderer/pages/settings/components/install-page.tsx` — install detail uses the sectioned layout (variant A).
- Reads only `~/.claude/plugins/marketplaces/**` and `~/.claude/plugins/plugin-catalog-cache.json`; no new dependencies, no network calls.
- The prototype at `openspec/changes/prototype-plugin-detail/probe.html` (variant A won) is archived with this change.
