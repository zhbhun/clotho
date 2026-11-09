# Design

## Context

See proposal.md for motivation. Current implementation facts that shape the approach:

- `InstallPluginPage` ([install-page.tsx](../../../src/renderer/pages/settings/components/install-page.tsx)) loads two IPC results — `agentListAvailablePlugins()` (catalog entries with `pluginId`, `name`, `description`, `marketplaceName`, `installCount`) and `agentListMarketplaces()` (registered marketplaces with `source.source` type) — then classifies entries into tabs via `tabForMarketplace` using the hardcoded `DIRECTORY_MARKETPLACE = 'anthropic-plugin-directory'` constant.
- Verified CLI behavior (2.1.310): `claude plugin marketplace list --json` omits the built-in directory marketplace, while every `plugin list --available --json` entry carries `marketplaceName`. The `source.source` values are `github` / `git` / `url` / `directory` (local folder). The plugin-id suffix is the marketplace name for all sources.
- Verified dual-install hazard: installing `superpowers@anthropic-plugin-directory` while `superpowers@superpowers-marketplace` was installed succeeded, auto-enabled the older directory copy and silently disabled the newer marketplace copy. The CLI offers no dedup or warning; dedup must live in this page.
- Installed records come from `listAgentPlugins()` (`AgentPluginInfo.id` is `name@marketplace`); the page already loads them for badge state.
- The install detail page (`InstallPluginDetailPage`) and `plugin-shared` / `plugin-detail-page` helpers are unaffected by the tab removal and stay as-is.

## Goals / Non-Goals

**Goals:**
- One deduplicated catalog list with deterministic ordering, source labels, and a source filter.
- Name-based dedup that makes the dual-install hazard unreachable from this page.
- Delete the tab classification and the hardcoded directory-name constant from page logic (the name remains as the documented way to *recognize* directory entries, per CLI limitation).

**Non-Goals:**
- No changes to the IPC contract, main process, or CLI invocation.
- No changes to the Marketplaces management pages, Add marketplace flow, marketplace detail pages, or the install detail page.
- No catalog-level refresh action, version display, or upgrade flow.
- No cross-page state: dedup happens in the page's memo pipeline, not a store.

## Decisions

### D1: Deduplicate by plugin name, not pluginId

Dedup key is the plugin name (the `name` field, equivalent to `pluginId` before `@`). Rationale: the dual-install hazard is same-name-different-marketplace; dedup by `pluginId` (name@marketplace) would keep both copies and leave the hazard. The spec's installed-badge semantics also match by name (an installed `superpowers@superpowers-marketplace` marks the single `superpowers` entry installed). Alternative considered: dedup by pluginId and hide duplicates — rejected, it preserves the "two installable copies" trap.

Precedence (first match wins): installed entry > user-registered marketplace entry > built-in directory entry > deterministic tiebreak (lexicographic marketplace name, then pluginId). Installed detection: the page's `installedIds` set currently holds `name@marketplace` ids; it becomes a set of *names* extracted from those ids (split at last `@`) so badge matching follows the same name key.

### D2: Directory detection stays name-based, isolated in one helper

The CLI's JSON marketplace list omits the built-in directory, so there is no structural signal; entries are recognized by `marketplaceName === 'anthropic-plugin-directory'`. This is kept, but the constant moves out of the page into a small pure helper module (e.g. `catalog.ts` under `pages/settings/components/` or `utils/`) alongside the dedup/precedence/order functions, so the page consumes plain data. Pure functions make the dedup rules directly unit-testable without rendering. Alternative: parsing the CLI's human-readable output to discover the directory — rejected as fragile string parsing over a UI format.

### D3: Source label and filter derive from one source-name map

For each deduplicated entry, the source label is its verbatim `marketplaceName` — including the built-in directory (`anthropic-plugin-directory`); no display-name layer. The filter dropdown options are the distinct labels present in the deduplicated catalog (registered marketplaces sorted, directory last, matching the reviewed prototype), plus `All sources`. Filter state stores the raw marketplace name (or `''` for all), not the label, so locale changes don't break the filter. The existing `sources` map (`name → source.source`) is still loaded: it distinguishes a local directory-type marketplace (shown as its name, e.g. `zhbhun`) from the built-in one — only the built-in is hidden behind the magic name.

### D4: Ordering computed in the same memo pipeline

Filter → dedup → order in one `useMemo`: install count descending (unknown counts last), then alphabetical by plugin name — no installed-first tier (user decision from prototype review; installed entries no longer jump to the top). Sorting is stable (tiebreak by marketplace/pluginId) so React keys (`pluginId`) and row order don't shuffle across reloads. Search and source filter narrow this ordered list without re-sorting. Entries render as a single-column list (user decision from prototype review), not the previous two-column grid.

### D5: Remove tab strings, add filter strings

i18n: drop `tabPublic` / `tabCommunity` / `tabPersonal`; add source-filter label, `All sources`, and the `directory` source label. Entry rows, `+` button, badge, search placeholder, and install flow strings are unchanged.

### D6: Slugs stay as-is — no display-name layer

Marketplace and plugin names shown in the list (and the filter options) are the CLI slugs (`claude-plugins-official`, `42crunch-api-security-testing`). Verified data sources offer no display name: `marketplace list --json` has no title field; marketplace.json `displayName` exists for only 16 of 315 official plugins (and none in the user's other marketplaces), and the directory cache's display names ("Superpowers") exist only in a local cache file the CLI's JSON output does not expose. Building a prettifying layer (humanizing slugs or mixing sparse displayName data) would create inconsistent labels for no functional gain. Revisit only if the CLI later exposes display names.

### D7: Incremental rendering, not virtualization

Data loads in full up front (the CLI offers no pagination and the payload is a few MB of JSON), but the list renders in pages of 100 rows, appending the next page when the viewport approaches the rendered end (IntersectionObserver-style sentinel in React). Filter/search changes reset to the first page. Virtual scrolling (`@tanstack/react-virtual`) was evaluated and dropped: at real scale (~3,600 rows) plain full rendering already scrolled without jank on the target machine, and incremental paging keeps DOM size bounded while avoiding virtualization's measurement complexity (dynamic row heights, scroll anchoring, nested menus). Paging is a user decision from prototype review.

## Risks / Trade-offs

- [Name-based dedup hides a genuinely distinct plugin that happens to share a name across marketplaces] → Accepted: CLI plugin ids are name-qualified and installs are name-colliding anyway (the hazard), so one visible entry per name matches reality. The source label shows which copy was chosen; the filter can reveal other sources' offerings.
- [The `anthropic-plugin-directory` constant breaks if Anthropic renames the built-in market] → Mitigation: the constant lives in one helper with a comment documenting the CLI behavior; failure mode is benign (directory entries mislabeled as a marketplace and shown alongside others), not a crash.
- [Directory cache lag still delays directory entries on first run] → Mitigation: registered-marketplace entries appear as soon as they load, so the page is never empty when the user has marketplaces; the loading spinner covers only the initial fetch.
- [Precedence picks a lower-version copy when a registered marketplace is stale] → Mitigation: the marketplace pages own refresh; the source label makes the chosen copy visible. Version display is a non-goal for this change.

## Migration Plan

Single-page UI change, no data migration. Ship as one commit; rollback is reverting the commit. i18n key removal is additive-safe during the change (keys removed in the same PR that removes their usage).

## Open Questions

(none)
