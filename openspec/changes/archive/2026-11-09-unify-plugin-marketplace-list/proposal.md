# Proposal

## Why

The Install plugin page splits the plugin catalog into Public / Community / Personal tabs, but the three-way split is a CLI implementation detail, not a user-meaningful distinction: Public is the CLI's built-in Anthropic directory (a curated subset that misses many plugins the user's own marketplaces offer), Community and Personal differ only in marketplace source type. Users cannot tell what the tabs mean, a stale directory cache leaves Public showing "Nothing here yet" even though thousands of plugins are available, and the same plugin can appear in several tabs at once. Installing a second copy from another tab is silent and harmful: verified against CLI 2.1.310, installing `superpowers@anthropic-plugin-directory` while `superpowers@superpowers-marketplace` 7.0.0 was installed succeeded, auto-enabled the older 6.4.2 directory copy, and silently disabled the newer marketplace copy — the CLI offers no guard, so the UI must deduplicate.

## What Changes

- Replace the Public / Community / Personal segmented control with a single unified catalog list; every available plugin from all sources appears in one searchable list.
- Deduplicate catalog entries by plugin name across sources with a stable precedence: an installed entry wins over any catalog entry, then user-registered marketplace entries win over built-in directory entries. This prevents the silent dual-install/quiet-downgrade observed in the CLI.
- Show each entry's source as an inline label (marketplace name; a "directory" marker for built-in directory entries) on the entry row, replacing tab membership as the way users understand where a plugin comes from.
- Add a source filter (dropdown, default "All sources") next to search for narrowing the list when the flat list is too broad; filtering by a specific marketplace replaces the old tab behavior without the three-way semantics.
- Keep catalog ordering deterministic: by install count descending (unknown counts last), then alphabetical.
- Render entries as a single-column list with three-line rows (name / description / `source · installs`); installed entries get a `⋮` dropdown with Uninstall in place of the old Installed badge; search matching and the install detail page stay unchanged.
- Remove the `tabForMarketplace` classification and its hardcoded `anthropic-plugin-directory` name constant from the page.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `plugin-settings-pages`: The "Install plugin page with source tabs" requirement is modified in place (name kept as the delta anchor): its behavior changes from the Public/Community/Personal tab classification to a single unified catalog list with name-based deduplication, inline source labels, a source filter, and deterministic ordering.

## Impact

- `src/renderer/pages/settings/components/install-page.tsx` — the Install plugin page: tab state, `tabForMarketplace`, and the tab UI are replaced by deduplication, source labels, a source filter, and ordering; the install detail page is unchanged.
- i18n resources — new strings for the source filter and directory label; removed strings for the three tab labels.
- `src/renderer/pages/settings/components/agent-plugin-settings.test.tsx` — tab classification tests are replaced by deduplication, filter, and ordering tests.
- No changes to `src/main`, `src/shared/rpc.ts`, or the IPC contract: `agentListAvailablePlugins` and `agentListMarketplaces` already return everything the unified list needs.
- Known CLI limitation documented for design: `claude plugin marketplace list --json` omits the built-in directory marketplace while `plugin list --available --json` entries reference it, so source detection for directory entries must fall back to the marketplace name.
