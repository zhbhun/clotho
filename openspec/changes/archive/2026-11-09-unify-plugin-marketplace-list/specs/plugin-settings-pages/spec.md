# Spec Delta

## ADDED Requirements

### Requirement: Install plugin page with unified catalog

The Install plugin page (second level, breadcrumb `Plugins › Install plugin`) SHALL present a single unified catalog of every available plugin from all sources — the built-in Anthropic directory and every user-registered marketplace — as one searchable list. The page SHALL NOT render a Public/Community/Personal segmented control and SHALL NOT classify entries by tab. The page SHALL NOT offer a catalog refresh action; refreshing happens through the marketplace pages.

#### Scenario: Unified list replaces tabs

- **WHEN** the user opens the Install page
- **THEN** the page shows one catalog list containing built-in directory entries and entries from the user's registered marketplaces side by side, with no Public/Community/Personal control and no refresh action

### Requirement: Catalog deduplication by plugin name

When several catalog entries share a plugin name across sources, the page SHALL show exactly one entry, resolved by precedence: an entry whose plugin is installed wins over any uninstalled entry; among uninstalled entries, one from a user-registered marketplace wins over one from the built-in directory; remaining ties resolve deterministically (stable order by marketplace then plugin id). Installed status SHALL be checked per plugin name, matching any `name@marketplace` install record.

#### Scenario: Same plugin in directory and a registered marketplace deduplicates

- **WHEN** the catalog contains `superpowers` from both the built-in directory and the registered `superpowers-marketplace`, and the installed record is `superpowers@superpowers-marketplace`
- **THEN** the list shows a single `superpowers` entry marked Installed (matching by plugin name), with `superpowers-marketplace` as its source label, and no second directory entry is shown

#### Scenario: Duplicate uninstalled entries prefer the registered marketplace

- **WHEN** the catalog contains `frontend-design` from both the built-in directory and the registered `claude-plugins-official`, and neither is installed
- **THEN** the list shows a single `frontend-design` entry with `claude-plugins-official` as its source label

### Requirement: Catalog entry presentation

Each entry row SHALL render three lines: the plugin name on the first line, the description on the second line, and on the third line as smaller subtle text the source label followed by the install count when known (a download icon before the number, no unit word). The source label SHALL be the verbatim marketplace name (`anthropic-plugin-directory` for entries whose marketplace is the built-in Anthropic directory); no display-name layer.

#### Scenario: Directory entry label

- **WHEN** a catalog entry's marketplace is the built-in Anthropic directory (marketplace name `anthropic-plugin-directory`, omitted from the CLI's marketplace JSON)
- **THEN** the entry's source label renders as its verbatim marketplace name `anthropic-plugin-directory`

#### Scenario: Entry row layout

- **WHEN** an uninstalled catalog entry `superpowers` from the built-in directory with 1200 installs and a description is listed
- **THEN** its row shows the name on the first line, the description on the second line, and `anthropic-plugin-directory | ⬇ 1,200` (vertical-bar separator, download icon before the number) as subtle text on the third line, ending with a borderless `+` button

The entry's right end SHALL be a borderless `+` button for uninstalled entries; for installed entries it SHALL be a vertical-ellipsis (`⋮`) button that opens a dropdown menu with, in order: Enable or Disable (matching the plugin's current enabled state), Open (opens the plugin homepage via the app link opener when the manifest declares one, hidden otherwise), and Uninstall (destructive styling). Entries SHALL render as a borderless single-column list with hover highlight. Source and plugin names SHALL render as the CLI slugs (no display-name layer).

#### Scenario: Installed entry menu uninstalls

- **WHEN** the user clicks the `⋮` button on an installed entry and picks Uninstall
- **THEN** the system uninstalls that plugin via the CLI, shows the restart hint, and the entry flips to the uninstalled state with a `+` button

#### Scenario: Installed entry menu toggles enable state

- **WHEN** the user clicks the `⋮` button on an enabled installed entry and picks Disable, then reopens the menu
- **THEN** the system records the disabled state via the CLI and shows the restart hint, and the menu now offers Enable

#### Scenario: Installed entry menu opens the homepage

- **WHEN** the user clicks the `⋮` button on an installed entry whose manifest declares a homepage and picks Open
- **THEN** the system opens the homepage in the default browser; entries whose manifest declares no homepage SHALL NOT show an Open item

### Requirement: Deterministic catalog ordering

Catalog ordering SHALL be deterministic: by install count descending (entries without a known count last), then alphabetical by plugin name.

#### Scenario: Ordering across entry kinds

- **WHEN** the catalog contains an entry with 500 installs, an entry with no install count, and an entry with 1200 installs, all names distinct
- **THEN** the list shows the 1200-install entry first, then the 500-install entry, then the no-count entry; entries with equal install counts appear in alphabetical name order, stable across reloads

### Requirement: Incremental rendering of the catalog

The page SHALL load the full catalog data up front (the CLI exposes no pagination) but render it incrementally: the first page of rows (100) initially, appending the next page when the viewport approaches the rendered end. Changing the source filter or search text resets rendering to the first page. The page SHALL NOT use list virtualization.

#### Scenario: Scroll loads more rows

- **WHEN** the user scrolls the list near its rendered end while more filtered entries exist
- **THEN** the next page of rows is appended without replacing existing rows

#### Scenario: Filter change resets paging

- **WHEN** the user selects a different source or types into search after having scrolled through several pages
- **THEN** the list re-renders starting from the first page of the newly filtered rows

### Requirement: Source filter and search on the unified catalog

The page SHALL render a source filter dropdown next to the search input, listing `All` (default) plus one option per distinct source in the deduplicated catalog. Selecting a source narrows the list to entries from that source; search text (name, description, and marketplace match) applies on top of the filter.

#### Scenario: Source filter narrows the list

- **WHEN** the user opens the source filter dropdown
- **THEN** it lists `All`, `anthropic-plugin-directory`, and every distinct registered marketplace name present in the catalog; selecting `zhbhun` shows only entries whose source label is `zhbhun`, and selecting `All` restores the full list

#### Scenario: Search applies on top of the source filter

- **WHEN** a source other than `All` is selected and the user types text into search
- **THEN** the list shows only entries from the selected source whose name, description, or marketplace matches the text

### Requirement: Installing from the unified list

Clicking a borderless `+` button on an uninstalled entry SHALL install that plugin via the CLI, surface the restart hint, and flip the entry to the installed state (a `⋮` button with the Uninstall menu, per the entry presentation requirement). The page SHALL NOT display a result-count summary above the list.

#### Scenario: Installing from the list

- **WHEN** the user clicks the `+` button on an uninstalled entry
- **THEN** the system installs that plugin, shows the restart hint, and the entry now shows the `⋮` menu button

#### Scenario: No result count

- **WHEN** the user filters by a source or types into search
- **THEN** the page updates the list without showing any matched-count or total-count text

## REMOVED Requirements

### Requirement: Install plugin page with source tabs

**Reason**: The Public/Community/Personal tab split encodes a CLI implementation detail (marketplace source type) that users cannot interpret, leaves Public empty when the directory cache has not loaded, and scatters the same plugin across tabs — enabling silent dual installs that the CLI does not guard against.

**Migration**: Replaced by the "Install plugin page with unified catalog" requirement above: one deduplicated list with inline source labels and a source filter covering the old tabs' browsing needs.
