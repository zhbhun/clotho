# Design

## Context

`listMarketplaces` maps the Claude CLI's list response, which includes an `installLocation` but no marketplace description. The Marketplace tab stores these results in the existing renderer cache. The plugin catalog already supplies the avatar and two-column tile pattern chosen in prototype variant A.

## Goals / Non-Goals

**Goals:** Enrich the registered marketplace list from local data and match the existing catalog visual language while preserving marketplace navigation and cache behavior.

**Non-Goals:** Show marketplace versions, change plugin installation, fetch descriptions from a network service, or alter marketplace detail content.

## Decisions

1. Read `<installLocation>/.claude-plugin/marketplace.json` in the main process for each CLI entry. Use a nonempty top-level `description`, falling back to nonempty `metadata.description`; ignore invalid types and whitespace-only strings. CLI-provided install locations cover both Git checkouts and local directory marketplaces. Read manifests concurrently and handle failures per entry so one unavailable file does not hide other markets. Do not infer descriptions from individual plugins.
2. Add optional `description` to the marketplace response on both sides of the shared contract. Keep the existing last-successful-result cache and background revalidation; refreshing the marketplace list naturally refreshes descriptions.
3. Reuse the existing plugin avatar and grid conventions for borderless tiles. Display name, optional one-line truncated description, and source in that order; preserve source path formatting, click navigation, registered count, Add, Refresh all, and empty/loading behavior. Use the same narrow-window breakpoint as the plugin catalog.
4. Prototype variant A was selected by the user. The archived prototype captures alternatives without shipping prototype UI in the app.

## Risks / Trade-offs

- Manifests may be absent, unreadable, or malformed → omit that entry's description, retaining the rest of the list.
- Local manifest contents may be stale → existing marketplace refresh updates the CLI-managed source and revalidates the cache.
- More local reads can increase initial load latency → read entries concurrently and keep the existing renderer cache.
