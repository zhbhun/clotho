# Design

## Context

`InstallPluginPage` (src/renderer/pages/settings/components/install-page.tsx) renders the catalog as a flat `flex flex-col` of `data-install-tile` rows inside `data-install-list`. Each row already has name / description / `marketplace | count` lines and the `+` / `⋮` action. The page sits inside the settings content container, `max-w-[800px]` (src/renderer/components/app-layout.ts:3). Tests select via `[data-install-list]` and text queries, not layout (agent-plugin-settings.test.tsx).

Catalog data (`AgentMarketplacePlugin`) carries no icon field — visual identity must be derived. Typography follows the settings convention: entry titles 14px/400, descriptions `text-foreground-subtlest`. The validated prototype lives at `prototype.html` in this change (variant A).

## Goals / Non-Goals

**Goals:**
- Two-column icon-row layout inside the existing 800px content width.
- Deterministic per-name letter avatar as the visual anchor.
- Keep every existing behavior: search, filter, dedup, ordering, incremental rendering, actions.

**Non-Goals:**
- No changes to installed-plugin list, marketplace detail page, or install detail page.
- No icon data, remote assets, or RPC contract changes.
- No virtualization (incremental rendering stays).

## Decisions

- **Letter avatar, not images**: `AgentMarketplacePlugin` has no icon field. A deterministic letter avatar (rounded square, name-hashed hue, first character) is the standard no-data fallback and is what the prototype validated. Alternative — remote icon fetch from the directory API — rejected: new network surface, unverified field, no per-marketplace coverage.
- **Hue derivation**: pure function, string hash (×31 + char) → golden-angle step (×137.508° mod 360). Deterministic across reloads, evenly distributed hues, zero collisions of concern. Two tailwind-friendly HSL stops (bg `hsl(H 70% 90%)`, text `hsl(H 46% 34%)`) work in light mode; app is effectively light-only in this surface, and tokens keep a dark-mode swap trivial later.
- **Grid with explicit shrinkable tracks**: `grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]` — the prototype showed plain `grid-cols-2` (`1fr 1fr`) overflows with `nowrap` text because `1fr` floors at min-content; `minmax(0,1fr)` restores ellipsis truncation. Single-column fallback via the existing responsive pattern (`max-lg:grid-cols-1`) — the settings dialog can be narrowed below two-column width.
- **Row anatomy stays three lines**: the user explicitly kept the marketplace · download-count meta line (variant B dropped it; A kept it). Name stays 400 weight per the user's typography decision.
- **Keep actions as-is**: ghost `+` / `⋮` beat variant B's Install pill — consistent with the rest of the settings UI and with the already-validated install flow.
- **Scope guard**: only `InstallPluginPage`'s list markup changes. `data-install-list` / `data-install-tile` / `data-install-sentinel` hooks survive so tests and the sentinel observer stay intact.

## Risks / Trade-offs

- [Letter avatars are not brand icons; "store feel" rests on structure + color rhythm] → Accepted with the user; this is the standard fallback (VS Code, npm) when no icon data exists.
- [Two-column grid + IntersectionObserver sentinel] → Sentinel stays a block element after the grid; observer logic untouched.
- [Hue function is a new pure helper] → Colocate next to the page with a focused unit test (determinism + range); no separate module.
- [Hash collision gives two plugins the same color] → Harmless (adjacent hue steps make collisions rare); no action.

## Migration Plan

Single-component change; no data migration. Roll back by reverting the component.

## Open Questions

None.
