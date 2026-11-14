# Design

## Context

`getPluginDetails` (src/main/claude/agent-config/plugin-details.ts) today assembles detail from two sources: the installed record's install-path manifests and the CLI catalog entry. The catalog feed (`listMarketplacePlugins`, src/main/claude/agent-config/plugins.ts) maps only five fields and drops the CLI's `version`. The renderer's detail pages (plugin-detail-page.tsx shared sections; install-page.tsx `InstallPluginDetailPage`) render three component sections (Skills/MCP/Subagents) and an Info block that hides the whole block when all values are missing.

Verified local data (2026-11-11, CLI 2.1.310):

- `~/.claude/plugins/marketplaces/<m>/.claude-plugin/marketplace.json` exists for every registered marketplace. Official: 315 entries — category 301, homepage 299, author 233, plus displayName/tags/version/keywords.
- `~/.claude/plugins/plugin-catalog-cache.json` (GCS-derived, official marketplace only): 315 plugins, 311 with non-empty `components` ({skills, commands, agents, mcpServers, hooks}, name + per-model token stats; component items are name-only except where nested), plus `unique_installs` and `last_updated`.
- CLI `plugin list --available --json` entries carry `version` (3531/3988) — currently dropped by our mapping.
- Built-in directory index (`plugin-directory-cache-v2.json`): thin (summary, version, repo URL; no category/author).

Marketplace names map to snapshot directories via `known_marketplaces.json` `installLocation` (or directly `~/.claude/plugins/marketplaces/<name>`); the directory marketplace has no snapshot. The prototype (`openspec/changes/prototype-plugin-detail/probe.html`) validated the sectioned layout; variant A won.

## Goals / Non-Goals

**Goals:**

- Detail (both pages) shows author/category/homepage/displayName/version from the marketplace snapshot when local data provides them.
- Uninstalled official plugins show real component sections from the catalog cache.
- Catalog feed keeps `version`.
- Zero network; missing/unreadable local sources degrade silently.
- Section layout: variant A (component sections with kind icons + counts, Info rows omitted individually).

**Non-Goals:**

- No on-demand fetching for directory-only entries (their thin detail is the accepted ceiling; revisit as a separate change).
- No i18n/display-name plumbing beyond using an existing displayName for the title.
- No hero image, example prompts, paid-plan badges (ZCode listing features whose data Claude's ecosystem does not provide).
- No catalog-list visual changes (rows stay as specced; only detail pages change).

## Decisions

- **D1 — Enrichment lives in the main process, inside `getPluginDetails`.** The renderer keeps calling one RPC; the main process joins four sources: marketplace snapshot → catalog cache → install manifests → installed record (later sources win). Alternative (enrich in renderer from new RPCs) rejected: it would spread CLI-layout knowledge across processes and duplicate fallback logic.
- **D2 — Snapshot location via `known_marketplaces.json` `installLocation`, falling back to `~/.claude/plugins/marketplaces/<name>`.** `installLocation` is authoritative (handles non-standard add paths); the fallback covers the directory-marketplace omission case being absent anyway.
- **D3 — Join key: plugin name within the entry's marketplace.** Snapshot entries are keyed by `name`; the detail request's `pluginId` splits into `<name>@<marketplace>`. For installed plugins the record's marketplace is used. No fuzzy matching.
- **D4 — Catalog cache read is whole-file-once with mtime guard.** The cache is one ~315-entry JSON; read it per detail call but memoize by mtime to keep repeated detail opens cheap. Snapshots are read per call (small files, called once per page open).
- **D5 — Component groups extend the existing three with `commands` and `hooks`.** `AgentPluginDetails` gains optional `commands`/`hooks` arrays; renderer sections iterate all five groups, each omitted when empty (spec: sections with no entries are omitted). Catalog-cache `mcpServers`/`hooks` items may be name-only — the type already tolerates missing descriptions.
- **D6 — Category renders verbatim, untranslated.** Snapshot categories are free-text slugs (`security`, `monitoring`); no i18n mapping layer (unlike ZCode's known-category table) — a translation layer is speculative until a real category taxonomy settles.
- **D7 — Homepage in Info opens via `appOpenLink`** like the list menu's Open action; render as a link-styled row value.

## Risks / Trade-offs

- **Snapshot/cache staleness**: data refreshes only when the CLI refreshes marketplaces/catalog; a stale homepage or version may show. Accepted (same staleness the list already has for descriptions).
- **CLI format drift**: both files are CLI-internal with no stability guarantee. Mitigation: defensive parsing — any shape mismatch yields "source absent", never an error (the spec's silent-skip scenario). Keep parsers in one module for cheap adjustment.
- **Performance**: detail open now reads up to two extra small JSON files; mtime memoization keeps the catalog cache from re-parsing on every open. No measurable risk at 315-entry scale.
