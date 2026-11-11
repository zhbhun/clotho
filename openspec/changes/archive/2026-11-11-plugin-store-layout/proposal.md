# Proposal

## Why

The Marketplace Plugins tab renders each catalog entry as a three-line text row in a single borderless column. With thousands of directory entries the page reads as a wall of text — dense, monotonous, and nothing like a store: no per-entry visual anchor, no spatial scanning. The user asked for a store-like presentation, validated against ChatGPT connector / App Store reference screenshots.

## What Changes

- The Plugins tab catalog list becomes a two-column layout (single column on narrow viewports) of icon rows with hover highlight, replacing the single-column borderless list.
- Each entry gains a deterministic letter avatar: a rounded square tinted by a name-derived hue showing the plugin name's first character. The catalog data has no icon field; the avatar provides the store-style visual anchor without new data or assets.
- Rows keep all three text lines: plugin name, description (truncated), and `source | download-count` as subtle text.
- Row actions are unchanged: borderless `+` for uninstalled entries, `⋮` overflow menu (Enable/Disable, Open, Uninstall) for installed ones. Clicking a row still opens the install detail page.
- Search, source filter, dedup, ordering, and incremental rendering are unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `plugin-settings-pages`: The "Catalog entry presentation" requirement changes — entries render as two-column icon rows with letter avatars instead of a single-column borderless list, within the 800px content width. All other catalog requirements (dedup, ordering, filtering, search, install actions, incremental rendering, install detail) are unchanged.

## Impact

- `src/renderer/pages/settings/components/install-page.tsx` — the catalog list markup in `InstallPluginPage` only.
- No shared/RPC contract change: the avatar derives from data already present (`name`).
- A new small pure helper (name → hue) plus avatar component colocated with the page.
- No new dependencies; plain Tailwind + inline style.
- Existing tests select by `[data-install-list]` and text queries, not layout — they survive unchanged; add coverage for the two-column grid and avatar.
