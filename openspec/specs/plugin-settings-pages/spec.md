# plugin-settings-pages Specification

## Purpose

Own the Plugins settings page structure: how the installed-plugin list, plugin detail, marketplace list/detail, add-marketplace form, and install pages are organized, navigated, and presented. The CLI-backed management contract stays in `agent-capability-settings`; this capability owns the observable page behavior on top of it.

## Requirements

### Requirement: Marketplace settings category and tabs

The settings sidebar SHALL show Marketplace immediately above Plugins. Marketplace SHALL show centered capsule-style Plugins and Marketplaces tabs at the top without a separate page title. Plugins SHALL be selected when entering Marketplace from the sidebar or Plugins action, and the selected sidebar category SHALL remain Marketplace while either tab is open.

#### Scenario: Enter Marketplace from the sidebar

- **WHEN** the user selects Marketplace in the sidebar
- **THEN** Marketplace is selected in the sidebar, Plugins is selected in the centered tabs, and the plugin catalog is shown

#### Scenario: Switch to marketplace sources

- **WHEN** the user selects the Marketplaces tab
- **THEN** the registered marketplace list is shown and Marketplace remains selected in the sidebar

### Requirement: Plugins page shows the installed plugin list with paged actions

The Plugins settings category SHALL present a top-level page whose content is the installed plugin list only. The list header row SHALL show a localized installed summary (`Installed N items`) at its left and a Marketplace action at its right that selects the Marketplace sidebar category and opens its Plugins tab. Refresh all SHALL remain available. The page SHALL NOT render an inline market catalog, an add-marketplace input, or the marketplace list.

Each installed-plugin row SHALL show the plugin name on its first line and, on a second line as plain subtle text, `scope · marketplace · version` separated by `·` — no badges for scope or version. Rows SHALL NOT carry a delete action; removal lives on the plugin detail page. Each row SHALL end with: an enable/disable switch, then a chevron that opens the plugin detail page.

#### Scenario: Opening the pages from the Plugins page

- **WHEN** the user clicks the upper-right Marketplace action
- **THEN** the Marketplace sidebar category is selected and the Marketplace page shows the Plugins tab and catalog

- **WHEN** the user clicks Refresh all
- **THEN** the system refreshes every registered marketplace and reloads the installed list

#### Scenario: Plugin row layout

- **WHEN** an installed plugin (scope `user`, marketplace `superpowers-marketplace`, version `6.4.2`) is listed
- **THEN** its row shows the name `superpowers` on the first line and `user · superpowers-marketplace · 6.4.2` as subtle text on the second line, with the switch followed by the chevron at the row's right end and no delete button

### Requirement: Plugin detail page

The system SHALL open a plugin detail page (second level, breadcrumb `Plugins › <plugin name>`) from an installed plugin row's chevron. The page SHALL show the plugin name as its title with the plugin's description below it, followed by these sections in order: Skills (each skill's name and description), MCP servers (each server's name and a command or URL summary), Subagents (each subagent's name and description), and an Info block with author, category (when known), version, marketplace, root path, and installed date. The Info block SHALL NOT be collapsed.

The page's top-right actions SHALL be a `⋯` overflow menu with Enable or Disable (matching the plugin's current state) and Uninstall, styled as the destructive action. Install, uninstall, enable, and disable from this page SHALL surface the same restart hint as elsewhere, and uninstall SHALL return to the Plugins page with the list reloaded.

Detail data SHALL come from a dedicated RPC that the main process assembles from the plugin's install-path manifests (`plugin.json`, `skills/`, `agents/`, `.mcp.json`) and the installed-plugin record; a plugin whose manifests cannot be read SHALL still open with the installed record's fields and empty component sections.

#### Scenario: Opening detail for an installed plugin

- **WHEN** the user clicks a row's chevron for an installed plugin with 2 skills, 1 MCP server, and 1 subagent
- **THEN** the detail page opens at breadcrumb `Plugins › <name>` showing Skills (2), MCP servers (1), Subagents (1), and a non-collapsed Info block with version, marketplace, root path, and installed date

- **WHEN** the user opens the `⋯` menu on a detail page of an enabled plugin
- **THEN** the menu offers Disable and Uninstall; clicking Disable records the disabled state via the CLI and shows the restart hint without leaving the page

### Requirement: Marketplaces page and marketplace detail page

The Marketplaces tab of Marketplace SHALL list every registered marketplace, one row per marketplace with the name on the first line and `source-type · source` as subtle text on the second line. The list header SHALL show a registered count at its left and, at its right, an `Add` button opening the Add marketplace page and a `⋯` overflow menu with Refresh all. Marketplace rows SHALL NOT carry per-row refresh or delete actions.

Clicking a marketplace row SHALL open its detail page under Marketplace. The detail page SHALL show an Info block (source type and source) and a plugin list of that marketplace's catalog entries — each entry with name, description, install count when known, an Installed badge when installed, and an Install button otherwise. The detail page's header SHALL have a Refresh action for this marketplace and a `⋯` overflow menu with Remove marketplace (destructive, with confirmation; removing uninstalls that marketplace's plugins per the CLI contract and returns to the Marketplaces tab).

#### Scenario: Marketplace detail lists its plugins

- **WHEN** the user clicks the `zhbhun` marketplace row
- **THEN** the detail page opens under Marketplace showing its source (`directory · <path>`) and only the catalog entries whose marketplace is `zhbhun`

- **WHEN** the user clicks Remove marketplace on a marketplace detail page and confirms
- **THEN** the system runs the CLI marketplace removal and returns to the Marketplaces tab with the removed entry gone

### Requirement: Add marketplace page with conditional Git ref

The Add marketplace page SHALL open from the Marketplaces tab under Marketplace and present a form with a Source field and, while the Source value looks like a git repository (a GitHub `owner/repo` shorthand or a `git@`/`https://` URL, and not a local path beginning with `/`, `~`, or `./`), a Git ref field. The Git ref field SHALL be hidden for local folder paths and while Source is empty; its hint explains that the value pins a branch or tag and is appended to the source as `#ref`.

Submitting SHALL pass the source (with `#<ref>` appended when a ref is set on a repo-looking source) to the CLI's marketplace add; a local path with a ref value set submits the path alone. Cancel and leaving via list-bound navigation follow the shared unsaved-changes guard. Failure SHALL surface the marketplace error toast.

#### Scenario: Git ref appears only for repo sources

- **WHEN** the user types `anthropics/claude-plugins-official` into Source
- **THEN** the Git ref field appears; typing `v2.0.0` into it and submitting adds the marketplace from `anthropics/claude-plugins-official#v2.0.0`

- **WHEN** the user replaces Source with `~/Projects/zhbhun/trading`
- **THEN** the Git ref field disappears and submitting adds the marketplace from the bare path

### Requirement: Install plugin page with unified catalog

The Plugins tab of Marketplace SHALL present a single unified catalog of every available plugin from all sources — the built-in Anthropic directory and every user-registered marketplace — as one searchable list. The page SHALL NOT render a Public/Community/Personal segmented control and SHALL NOT classify entries by tab. The catalog SHALL NOT offer a refresh action; refreshing happens through the Marketplaces tab.

#### Scenario: Unified list replaces tabs

- **WHEN** the user opens Marketplace
- **THEN** the Plugins tab shows one catalog list containing built-in directory entries and entries from the user's registered marketplaces side by side, with no Public/Community/Personal control and no refresh action

### Requirement: Catalog deduplication by plugin name

When several catalog entries share a plugin name across sources, the page SHALL show exactly one entry, resolved by precedence: an entry whose plugin is installed wins over any uninstalled entry; among uninstalled entries, one from a user-registered marketplace wins over one from the built-in directory; remaining ties resolve deterministically (stable order by marketplace then plugin id). Installed status SHALL be checked per plugin name, matching any `name@marketplace` install record.

#### Scenario: Same plugin in directory and a registered marketplace deduplicates

- **WHEN** the catalog contains `superpowers` from both the built-in directory and the registered `superpowers-marketplace`, and the installed record is `superpowers@superpowers-marketplace`
- **THEN** the list shows a single `superpowers` entry marked Installed (matching by plugin name), with `superpowers-marketplace` as its source label, and no second directory entry is shown

#### Scenario: Duplicate uninstalled entries prefer the registered marketplace

- **WHEN** the catalog contains `frontend-design` from both the built-in directory and the registered `claude-plugins-official`, and neither is installed
- **THEN** the list shows a single `frontend-design` entry with `claude-plugins-official` as its source label

### Requirement: Catalog entry presentation

Each catalog entry SHALL render as a two-column icon row (two equal columns at the page's content width; a single column when the viewport is narrow). Each row SHALL show: a letter avatar on the left — a rounded square tinted by a hue derived deterministically from the plugin name, displaying the first character of the plugin name in uppercase — followed by three text lines: the plugin name on the first line, the description on the second line (truncated to one line), and on the third line as smaller subtle text the source label followed by the install count when known (a download icon before the number, no unit word). The source label SHALL be the verbatim marketplace name (`anthropic-plugin-directory` for entries whose marketplace is the built-in Anthropic directory); no display-name layer. Rows SHALL be borderless with hover highlight and SHALL NOT overflow their column: long descriptions truncate with an ellipsis instead of widening the column.

The plugin name on the first line SHALL render at regular weight (400), per the settings-list typography convention.

The entry's right end SHALL be a borderless `+` button for uninstalled entries; for installed entries it SHALL be a vertical-ellipsis (`⋮`) button that opens a dropdown menu with, in order: Enable or Disable (matching the plugin's current enabled state), Open (opens the plugin homepage via the app link opener when the manifest declares one, hidden otherwise), and Uninstall (destructive styling).

#### Scenario: Directory entry label

- **WHEN** a catalog entry's marketplace is the built-in Anthropic directory (marketplace name `anthropic-plugin-directory`, omitted from the CLI's marketplace JSON)
- **THEN** the entry's source label renders as its verbatim marketplace name `anthropic-plugin-directory`

#### Scenario: Entry row layout

- **WHEN** an uninstalled catalog entry `superpowers` from the built-in directory with 1200 installs and a description is listed
- **THEN** its row shows a letter avatar `S` on the left, the name on the first line, the description on the second line, and `anthropic-plugin-directory | ⬇ 1,200` (vertical-bar separator, download icon before the number) as subtle text on the third line, ending with a borderless `+` button

#### Scenario: Two-column arrangement

- **WHEN** the catalog renders several entries at the page's content width (800px)
- **THEN** the entries arrange into two equal columns of icon rows, ordered left-to-right then top-to-bottom by the deterministic catalog order, and no entry overflows the content width

#### Scenario: Deterministic avatar

- **WHEN** the same plugin name renders on the list and on any later reload
- **THEN** the avatar hue and character are identical each time (derived only from the plugin name)

#### Scenario: Narrow viewport collapses to one column

- **WHEN** the viewport is too narrow for two columns
- **THEN** the entries render as a single column with the same row anatomy

#### Scenario: Long description truncates within its column

- **WHEN** an entry has a description longer than its column width
- **THEN** the description truncates with an ellipsis and the two-column layout keeps the content width

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
- **THEN** it lists `All` followed by every distinct marketplace name present in the catalog in alphabetical order (the built-in directory `anthropic-plugin-directory` sorts in like any marketplace); selecting `zhbhun` shows only entries whose source label is `zhbhun`, and selecting `All` restores the full list

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

### Requirement: Install plugin detail page

Clicking a catalog entry on the Marketplace Plugins tab SHALL open an install detail page under Marketplace with the same section layout as the plugin detail page — title with description, Skills, MCP servers, Subagents when known, and an Info block (author, version, marketplace, install count when known) — except its top-right action SHALL be an `Install` primary button for uninstalled entries, replaced by an Installed badge for installed ones. Installing SHALL surface the restart hint and update the entry state.

#### Scenario: Opening an install detail and installing

- **WHEN** the user clicks the `42crunch-api-security-testing` tile in the catalog
- **THEN** the install detail page opens under Marketplace with an Install button at the top right

- **WHEN** the user clicks Install there
- **THEN** the plugin installs, the restart hint appears, and the button is replaced by the Installed badge

### Requirement: Navigation and dirty guard follow the shared detail navigation

All plugin and Marketplace pages SHALL follow the shared settings detail navigation: at most one page open at a time in the content pane, breadcrumb bar visible only on non-top-level pages, and unsaved form changes (the Add marketplace form) gated by the discard-confirmation dialog on list-bound navigation. Marketplace details SHALL use Marketplace as their breadcrumb root; returning from a detail SHALL restore the tab from which it was opened.

#### Scenario: Three-level breadcrumb navigation

- **WHEN** the user is on the Add marketplace page and returns to Marketplace
- **THEN** the Marketplaces tab is shown, confirming the discard dialog first when the form has unsaved changes

- **WHEN** the user returns from a catalog plugin detail
- **THEN** Marketplace shows the Plugins tab

- **WHEN** the user returns from a marketplace detail
- **THEN** Marketplace shows the Marketplaces tab

### Requirement: Marketplace catalog retains the last successful result
The Marketplace Plugins tab SHALL retain the most recent successful catalog and installed-plugin results in memory for the renderer lifetime. On a subsequent visit, it SHALL display the cached catalog without a blocking loading indicator and revalidate both results in the background. An empty successful catalog SHALL count as a cached result.

#### Scenario: First visit
- **WHEN** the Plugins tab opens without a cached catalog
- **THEN** it shows a loading indicator until the catalog request completes

#### Scenario: Return to the catalog
- **WHEN** the user returns to the Plugins tab after a successful catalog load
- **THEN** the cached list appears without waiting for the new catalog request and fresh catalog and installed-plugin results replace their respective cached results when available

#### Scenario: Changes outside Clotho
- **WHEN** plugins or marketplaces change outside Clotho and the user subsequently visits the Plugins tab
- **THEN** background revalidation updates the displayed catalog and installed state from the CLI results

### Requirement: Catalog revalidation preserves usable results
A failed background request SHALL retain its last successful result and report the failure without replacing the catalog with a blocking loading or empty state. A failed first catalog request SHALL retain the existing load-error behavior. A later visit SHALL retry failed requests.

#### Scenario: Revalidation fails
- **WHEN** catalog revalidation fails while a cached catalog is displayed
- **THEN** the cached catalog remains usable, an error is reported, and a subsequent visit retries the request

#### Scenario: Successful empty result
- **WHEN** a revalidation succeeds with an empty catalog
- **THEN** the empty result replaces the previous catalog and the empty state is shown

### Requirement: Catalog state follows successful management operations
Successful install, uninstall, enable, disable, add, remove, or refresh operations performed in Clotho SHALL reconcile or invalidate the affected cached results so the catalog reflects the operation. Results from requests started before a successful operation SHALL NOT overwrite its effects.

#### Scenario: Plugin state changes
- **WHEN** a plugin is installed, removed, enabled, or disabled from any settings page
- **THEN** returning to Marketplace reflects the successful operation and older in-flight responses cannot restore the previous state

#### Scenario: Marketplace sources change
- **WHEN** a marketplace is added, removed, or refreshed successfully
- **THEN** the catalog is revalidated and reflects the changed sources without allowing an older response to replace the newer result
