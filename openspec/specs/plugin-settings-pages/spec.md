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

The system SHALL open a plugin detail page (second level, breadcrumb `Plugins › <plugin name>`) from an installed plugin row's chevron. The page SHALL show the plugin name as its title — the display name when a marketplace snapshot or manifest provides one, otherwise the plugin name — with the plugin's description below it, followed by these sections in order: Skills (each skill's name and description), Commands (each command's name and description), MCP servers (each server's name and a command or URL summary), Subagents (each subagent's name and description), and Hooks (each hook's event name and a summary when known); a section with no entries SHALL be omitted. An Info block follows with author, category (when known), version, homepage (when known), marketplace, root path, and installed date. The Info block SHALL NOT be collapsed, and each Info row whose value is unknown SHALL be omitted individually.

Detail data SHALL come from a dedicated RPC that the main process assembles from local sources in increasing precedence — the marketplace-snapshot entry, the CLI catalog-cache entry, the plugin's download-cache sources (its most recently fetched revision, consulted only while it has no install record), the install-path manifests (`plugin.json`, `skills/`, `commands/`, `agents/`, `.mcp.json`), and the installed-plugin record: snapshot and catalog-cache sources fill fields the installed data lacks (author, category, homepage, display name, version, and component lists for uninstalled plugins), download-cache and install-path manifests provide real component descriptions, and a plugin whose manifests cannot be read SHALL still open with the installed record's fields and whatever component sections those sources provide.

The marketplace snapshot and catalog cache are local files under the CLI's plugin home (`~/.claude/plugins/`); detail assembly SHALL NOT make network requests. A snapshot or cache that is missing or unreadable SHALL be skipped silently — detail still opens with the remaining sources.

#### Scenario: Opening detail for an installed plugin

- **WHEN** the user clicks a row's chevron for an installed plugin with 2 skills, 1 MCP server, and 1 subagent
- **THEN** the detail page opens at breadcrumb `Plugins › <name>` showing Skills (2), MCP servers (1), Subagents (1), and a non-collapsed Info block with version, marketplace, root path, and installed date

- **WHEN** the user opens the `⋯` menu on a detail page of an enabled plugin
- **THEN** the menu offers Disable and Uninstall; clicking Disable records the disabled state via the CLI and shows the restart hint without leaving the page

#### Scenario: Detail for an uninstalled official plugin with catalog-cache components

- **WHEN** the user opens detail for an uninstalled plugin that has no install record but is listed in the CLI catalog cache with 5 skills, 2 commands, 1 agent, and 1 MCP server
- **THEN** the detail page shows Skills (5), Commands (2), Subagents (1), and MCP servers (1) from the catalog cache, and the Info block omits rows whose values no source provides (for example author, when neither snapshot nor cache has one)

#### Scenario: Snapshot fills fields the CLI catalog lacks

- **WHEN** a plugin's catalog entry carries no author, category, or homepage, but its marketplace's local snapshot entry declares them
- **THEN** the detail Info block shows the snapshot's author, category, and homepage values

#### Scenario: Unreadable snapshot does not block detail

- **WHEN** the marketplace snapshot file is missing or unreadable
- **THEN** the detail page still opens using the CLI catalog entry, install manifests, and installed record; no error is shown for the missing snapshot

### Requirement: Marketplaces page and marketplace detail page

The Marketplaces tab of Marketplace SHALL list every registered marketplace in borderless tiles with a name-derived letter avatar, name, optional marketplace description, and `source-type · source`, in that order. Tiles SHALL use two equal columns at the page's content width and one column on narrow windows, matching the plugin catalog's responsive layout. Names, descriptions, and sources SHALL truncate within their column. The list header SHALL show a registered count at its left and, at its right, an `Add` button opening the Add marketplace page and a `⋯` overflow menu with Refresh all. Marketplace tiles SHALL NOT carry per-row refresh or delete actions.

Clicking a marketplace tile SHALL open its detail page under Marketplace. The page SHALL use the plugin detail layout: a neutral letter avatar, marketplace name, owner when available, and description when available, followed by a borderless plugin section and an Info section. The plugin section SHALL show the marketplace's full catalog in its existing order, with its count and each plugin's name, description and install count when known; installed plugins SHALL show an Installed badge and uninstalled plugins SHALL offer a `+` icon action. Info SHALL show source type and source and SHALL include owner when available. A `⋯` menu in the header SHALL contain Refresh and Uninstall marketplace. Uninstall SHALL remain destructive, require confirmation, uninstall that marketplace's plugins per the CLI contract, and return to the Marketplaces tab.

#### Scenario: Marketplace detail lists its plugins

- **WHEN** the user clicks the `zhbhun` marketplace tile
- **THEN** the detail page opens under Marketplace showing its source type and path in Info and only the catalog entries whose marketplace is `zhbhun`

- **WHEN** the user clicks Uninstall marketplace on a marketplace detail page and confirms
- **THEN** the system runs the CLI marketplace removal and returns to the Marketplaces tab with the removed entry gone

#### Scenario: Marketplace tile with description

- **WHEN** a marketplace has a description and appears in the list
- **THEN** its tile shows a letter avatar, name, description, and source in that order, with no surrounding card

#### Scenario: Marketplace tile without description

- **WHEN** a marketplace has no readable nonempty description
- **THEN** its tile shows its name and source without a description line and remains selectable

#### Scenario: Responsive marketplace list

- **WHEN** the marketplace list is shown at the plugin catalog's normal content width
- **THEN** tiles use two equal columns, ordered left-to-right then top-to-bottom

- **WHEN** the window is too narrow for the plugin catalog's two-column layout
- **THEN** marketplace tiles render in a single column

#### Scenario: Marketplace detail identity

- **WHEN** a marketplace has an owner and a description
- **THEN** its detail shows its neutral letter avatar and name with the owner below, followed by the description, plugin section, and Info section

- **WHEN** the owner or description is missing
- **THEN** the corresponding text is omitted while the detail remains usable

#### Scenario: Refresh from marketplace menu

- **WHEN** the user chooses Refresh from the marketplace's `⋯` menu
- **THEN** that marketplace is refreshed and its detail data is reloaded

#### Scenario: Install plugin from marketplace

- **WHEN** an uninstalled plugin's `+` action is selected and installation succeeds
- **THEN** the plugin is installed using its full plugin ID, the restart hint is shown, and the action changes to an Installed badge

- **WHEN** installation fails
- **THEN** the error is shown and the `+` action remains available

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

Without search text, catalog ordering SHALL be deterministic: by install count descending (entries without a known count last), then alphabetical by plugin name. With nonempty search text, matching entries SHALL first be ordered by case-insensitive name match: exact name, name prefix, name substring, then description or marketplace matches. Within the name-prefix group, shorter names SHALL appear first; names of equal length SHALL retain the default catalog ordering. Within every other group the default catalog ordering SHALL apply.

#### Scenario: Ordering across entry kinds

- **WHEN** the catalog contains an entry with 500 installs, an entry with no install count, and an entry with 1200 installs, all names distinct, and no search text is entered
- **THEN** the list shows the 1200-install entry first, then the 500-install entry, then the no-count entry; entries with equal install counts appear in alphabetical name order, stable across reloads

#### Scenario: Search ranks exact matches before popularity

- **WHEN** the user searches `superpowers`, and the catalog has two entries named `superpowers` from different marketplaces, an entry named `superpowers-extra`, and another matching only in its description
- **THEN** the two exact name matches appear first, ordered by install count, followed by the prefix match and then the description match regardless of those entries' install counts

#### Scenario: Partial name and marketplace matches

- **WHEN** a search matches one plugin at the start of its name, another within its name, and a third only in its marketplace name
- **THEN** the prefix match appears before the name substring match, which appears before the marketplace match

#### Scenario: Search ignores casing and surrounding whitespace

- **WHEN** the search text contains surrounding spaces or uppercase letters
- **THEN** ranking and matching use the trimmed, case-insensitive text

#### Scenario: Shorter prefix matches rank higher

- **WHEN** the user searches `superpower`, and `superpowers` exists in two marketplaces while `superpower-builder` has more installs than one of them
- **THEN** both `superpowers` entries appear before `superpower-builder`, with same-length matches ordered by install count

### Requirement: Incremental rendering of the catalog

The page SHALL load the full catalog data up front (the CLI exposes no pagination) but render it incrementally: the first page of rows (100) initially, appending the next page when the viewport approaches the rendered end. Changing the source filter or search text resets rendering to the first page. The page SHALL NOT use list virtualization.

#### Scenario: Scroll loads more rows

- **WHEN** the user scrolls the list near its rendered end while more filtered entries exist
- **THEN** the next page of rows is appended without replacing existing rows

#### Scenario: Filter change resets paging

- **WHEN** the user selects a different source or types into search after having scrolled through several pages
- **THEN** the list re-renders starting from the first page of the newly filtered rows

### Requirement: Source filter and search on the unified catalog

The page SHALL render a source filter dropdown next to the search input, listing `All` (default) plus one option per distinct source in the full catalog. Selecting a source narrows the list to entries from that source; installed state and management actions SHALL use the exact plugin ID; search text (name, description, and marketplace match) applies on top of the filter.

#### Scenario: Source filter narrows the list

- **WHEN** the user opens the source filter dropdown
- **THEN** it lists `All` followed by every distinct marketplace name present in the catalog in alphabetical order (the built-in directory `anthropic-plugin-directory` sorts in like any marketplace); selecting `zhbhun` shows only entries whose source label is `zhbhun`, and selecting `All` restores the full list

#### Scenario: Search applies on top of the source filter

- **WHEN** a source other than `All` is selected and the user types text into search
- **THEN** the list shows only entries from the selected source whose name, description, or marketplace matches the text

#### Scenario: Search a source containing a duplicate plugin

- **WHEN** `frontend-design` exists in the directory and official marketplace, and the user selects the directory and searches for `frontend-de`
- **THEN** the directory entry is shown, and both entries are shown in the All view

#### Scenario: Same-name installation belongs to another source

- **WHEN** the official marketplace entry is installed and the user selects the directory entry of the same name
- **THEN** the directory entry offers installation instead of actions for the other marketplace entry

#### Scenario: A source contains only duplicate names

- **WHEN** every plugin in a source shares a name with another source
- **THEN** the source remains selectable and its entries can be shown

### Requirement: Installing from the unified list

Clicking a borderless `+` button on an uninstalled entry SHALL install that plugin via the CLI, surface the restart hint, and flip the entry to the installed state (a `⋮` button with the Uninstall menu, per the entry presentation requirement). The page SHALL NOT display a result-count summary above the list.

#### Scenario: Installing from the list

- **WHEN** the user clicks the `+` button on an uninstalled entry
- **THEN** the system installs that plugin, shows the restart hint, and the entry now shows the `⋮` menu button

#### Scenario: No result count

- **WHEN** the user filters by a source or types into search
- **THEN** the page updates the list without showing any matched-count or total-count text

### Requirement: Install plugin detail page

Clicking a catalog entry on the Marketplace Plugins tab SHALL open an install detail page under Marketplace with the same sectioned layout as the plugin detail page — title (display name when known) with description, then Skills, Commands, MCP servers, Subagents, and Hooks sections (each omitted when empty), followed by an Info block whose rows — developer, category, version, homepage (opens via the app link opener), install count (when known), and marketplace — are omitted individually when unknown. Its top-right action SHALL be an `Install` primary button for uninstalled entries, replaced by an Installed badge for installed ones. Installing SHALL surface the restart hint and update the entry state.

Component sections for an uninstalled entry SHALL come from the CLI catalog cache when it lists the plugin, or from the marketplace snapshot's declared component summaries when it does not; an entry with no component data from any local source SHALL show no component sections (its description and Info block still render).

#### Scenario: Opening an install detail and installing

- **WHEN** the user clicks the `42crunch-api-security-testing` tile in the catalog
- **THEN** the install detail page opens under Marketplace with an Install button at the top right

- **WHEN** the user clicks Install there
- **THEN** the plugin installs, the restart hint appears, and the button is replaced by the Installed badge

#### Scenario: Install detail for a catalog-cache plugin

- **WHEN** the user opens the install detail of an uninstalled official plugin listed in the catalog cache with component lists
- **THEN** the page shows the component sections with per-kind counts before the Info block, without installing anything or making network requests

#### Scenario: Install detail for a directory-only entry

- **WHEN** the user opens the install detail of an uninstalled built-in-directory entry that no local source enriches
- **THEN** the page shows the title, description, the Info block (version and marketplace at minimum), and no component sections

### Requirement: Catalog entries carry version

The unified catalog feed SHALL keep the `version` field the CLI's available-plugins output provides, and catalog detail pages SHALL display it in their Info blocks when present.

#### Scenario: Version flows to detail

- **WHEN** the CLI lists an available catalog entry with `version: "1.5.5"` and the user opens its install detail
- **THEN** the Info block shows version 1.5.5

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

### Requirement: Catalog entries by source

The catalog SHALL show one entry per plugin ID, including same-name plugins from different marketplaces, and SHALL use the full plugin ID for installed status and management actions.

#### Scenario: Same name in two sources

- **WHEN** the user searches All for a plugin present in two marketplaces
- **THEN** both entries are shown with their own source labels and actions

#### Scenario: Only one source is installed

- **WHEN** one of two same-name entries is installed
- **THEN** only that entry shows installed actions and the other offers installation

### Requirement: Marketplace source list retains the last successful result
The Marketplaces tab SHALL retain the last successful registered marketplace list in memory for the renderer lifetime. Subsequent visits SHALL display the cached list immediately and revalidate it in the background. An empty successful list SHALL count as cached. The list SHALL NOT wait for the plugin catalog.

#### Scenario: First visit
- **WHEN** the Marketplaces tab opens without a cached marketplace list
- **THEN** it shows a loading indicator until the marketplace list request completes

#### Scenario: Return to the list
- **WHEN** the tab opens after a successful list request
- **THEN** it shows the cached list without a blocking loading indicator and replaces it when revalidation succeeds

#### Scenario: Empty cached list
- **WHEN** the last successful result was empty and the tab is reopened
- **THEN** the empty state appears immediately while the list is revalidated

#### Scenario: Refresh failure
- **WHEN** a list revalidation fails with a cached result
- **THEN** the cached list remains visible, an error is reported, and a later visit retries

#### Scenario: Marketplace management
- **WHEN** a marketplace is added, removed, or refreshed successfully
- **THEN** the marketplace list is revalidated and earlier in-flight responses cannot replace the newer result

### Requirement: Directory marketplace source path

The marketplace list and detail SHALL display a directory marketplace's local source path when the CLI provides it. If the path is unavailable, they SHALL retain the existing source-type fallback.

#### Scenario: Directory marketplace with a path
- **WHEN** a registered marketplace has source type `directory` and a local source path
- **THEN** its list tile shows `directory · <path>` and its detail Info source shows `<path>`

#### Scenario: Directory marketplace without a path
- **WHEN** a directory marketplace has no source path
- **THEN** its list row and detail show the source type without an invented path

### Requirement: Directory marketplace path uses a home abbreviation
Marketplace list and detail SHALL display a macOS `/Users/<user>` prefix in directory source paths as `~`, consistent with other displayed paths. Paths without that prefix SHALL remain unchanged; the underlying source path SHALL remain unchanged.

#### Scenario: Home directory path
- **WHEN** a directory marketplace source path is `/Users/alice/Projects/trading`
- **THEN** its list row and detail source display `~/Projects/trading`

#### Scenario: Other directory path
- **WHEN** a directory marketplace source path is `/opt/plugins`
- **THEN** its list row and detail source display `/opt/plugins`

### Requirement: Marketplace descriptions come from local manifests

The marketplace list SHALL read each registered marketplace's description from its local marketplace manifest, preferring a nonempty top-level `description` and otherwise using a nonempty `metadata.description`. A missing, invalid, or unreadable manifest SHALL leave that marketplace's description absent without preventing other marketplaces from loading.

#### Scenario: Top-level description

- **WHEN** a marketplace manifest provides a nonempty top-level `description`
- **THEN** the marketplace list uses that value as its description

#### Scenario: Metadata description

- **WHEN** the top-level description is absent or empty and `metadata.description` is nonempty
- **THEN** the marketplace list uses the metadata description

#### Scenario: Missing or invalid manifest

- **WHEN** a marketplace manifest is missing, unreadable, or invalid
- **THEN** its marketplace remains in the list without a description and other entries still load

### Requirement: Marketplace owner comes from the local manifest

The marketplace detail SHALL show the nonempty owner name from the local marketplace manifest when available. Missing, unreadable, invalid, or incomplete manifests SHALL leave the owner absent without preventing marketplace details from loading.

#### Scenario: Owner name available

- **WHEN** the marketplace manifest contains a nonempty `owner.name`
- **THEN** the detail shows that owner in its identity and Info sections

#### Scenario: Owner unavailable

- **WHEN** the owner name or manifest is absent or invalid
- **THEN** the detail omits the owner and continues to show its available information
