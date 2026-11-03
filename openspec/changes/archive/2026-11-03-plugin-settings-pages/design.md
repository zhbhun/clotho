# Design

## Context

The Plugins category currently renders one long page (`agent-plugin-settings.tsx`): an installed list, an inline catalog toggle, and the marketplace list with per-row actions. The shared detail-page machinery (`settings-detail-store` + breadcrumb bar in `settings/index.tsx`) supports a single detail level per category, used by subagents and providers. The main-process plugin module (`src/main/claude/agent-config/plugins.ts`) wraps the Claude Code CLI and owns no plugin files itself; the RPC surface lives in `claude-service.ts` with types in `src/shared/rpc.ts`. A rev-4 prototype (`prototype.html` in this change) fixed the visual structure.

Two data facts shape the design (verified against CLI 2.1.310):

- `claude plugin list --json` gives installed plugins `installPath` but no description, skills, or MCP-component summary beyond `mcpServers`; `--available --json` gives `marketplaceName` and `installCount` but no source type.
- Plugin manifests live under `installPath` (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>`): `.claude-plugin/plugin.json` (description, author, homepage), `skills/<name>/SKILL.md`, `agents/*.md`, `.mcp.json`.

## Goals / Non-Goals

**Goals:**

- Six pages (installed list, plugin detail, marketplaces, marketplace detail, add marketplace, install) with the prototype's layout, reusing the shared detail navigation.
- Plugin and install detail data assembled in the main process from local files, no new CLI flags.
- Tab classification (Public/Community/Personal) derived from marketplace source types joined at render time.

**Non-Goals:**

- No sparse checkout, marketplace `path` in settings, or `--claudeai` sources in the Add form.
- No plugin icons (manifest `icon` is directory-only; CLI output does not carry it).
- No virtualized scrolling on the Install grid in this change; only search filtering (performance tracked as a risk).
- Project-scope plugin enable state stays out of scope (existing contract).

## Decisions

- **D1 — Third navigation level via one store extension.** Extend `SettingsDetailView`'s detail variant with an optional `parent: { kind: 'list' } | { kind: 'detail', file: string | null }`-style descriptor (concretely: `page: 'plugins' | 'marketplaces' | 'install'` plus `sub` for the third level). The breadcrumb bar in `settings/index.tsx` renders one segment per level; `requestLeave`/`backToList` walk one level up instead of jumping to the list. Alternative considered: keep level 3 as local component state inside the Marketplaces page — rejected because the breadcrumb bar lives outside the category component and the dirty guard is store-driven; two sources of truth for "what page is open" would desync.
- **D2 — Dirty guard only on Add marketplace.** Plugin/marketplace detail pages have no form, so only the Add page registers dirty state via the existing `useDetailDirty`. Enable/Disable from the detail menu is optimistic (same as the row switch today) and not gated.
- **D3 — `getAgentPluginDetails` reads files directly.** New main-process function takes the plugin id, finds its `installPath` from `claude plugin list --json` (already fetched by `listInstalledPlugins`), and reads: `plugin.json` (description, author, homepage, category via keywords), `skills/*/SKILL.md` frontmatter (name + description), `agents/*.md` frontmatter, `.mcp.json` (server names + command/url summary), plus installed record fields (version, marketplace, scope, installedAt, root path). Missing files degrade to empty sections; unreadable manifests keep the record fields. Alternative considered: a CLI `plugin details` call — the subcommand targets installed plugins only and prints human text, not JSON, so it cannot serve the install detail page.
- **D4 — Install detail for catalog entries reuses the same RPC shape with a catalog fallback.** For entries not installed locally, `getAgentPluginDetails` resolves from the available catalog (name, description, marketplace, installCount) and reads components only when a same-id installed copy exists. This keeps the Install detail page honest about what is known pre-install (Skills/MCP sections show only when locally readable).
- **D5 — Tab classification joins marketplace sources in the renderer.** `listAgentMarketplaces()` already returns `source.source` (`github` | `git` | `directory` | ...). The Install page builds a `marketplaceName → tab` map: `anthropic-plugin-directory` → Public, `directory` → Personal, everything else → Community. Entries whose marketplace is unknown fall into Community. No main-process change needed for classification.
- **D6 — Overflow menus use the existing `DropdownMenu` wrapper** (`src/renderer/components/dropdown-menu`), triggered by an icon `⋯` button; destructive items use the danger text style. The Install tab strip uses `@/shadcn/tabs`.
- **D7 — Page components split by responsibility.** `agent-plugin-settings.tsx` becomes a thin dispatcher (switch on the store's view) plus sibling files per page: `plugin-list-page`, `plugin-detail-page`, `marketplace-pages` (list + detail + add form), `install-page` (tabs + grid + install detail). Each stays under the ~300-line coupling budget; shared row/tile bits go through `agent-shared.tsx` only when reused across pages.

## Risks / Trade-offs

- [Install grid renders up to ~3,900 DOM rows] → search filter + tab split cut the visible set; if profiling shows jank, add windowing in a follow-up rather than pre-optimizing.
- [Manifest reading varies by plugin layout (no `plugin.json`, nested skills)] → every read is optional with fallbacks; detail pages render empty sections rather than failing.
- [`~/.claude` files change under the CLI's feet between list and detail fetches] → detail RPC re-runs `claude plugin list` itself so `installPath` is fresh; a vanished plugin returns a not-found error surfaced as a toast.
- [Three-level breadcrumb widens the shared navigation contract used by subagents/providers] → the store change is additive (optional level); existing two-level flows keep their behavior, covered by existing tests plus new ones.
- [CLI output drift (fields beyond v2.1.310)] → all parsing stays on the fields this change verified; unknown fields ignored as today.
