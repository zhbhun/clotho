# plugin-settings-pages Specification

## Purpose

Own the Plugins settings page structure: how the installed-plugin list, plugin detail, marketplace list/detail, add-marketplace form, and install pages are organized, navigated, and presented. The CLI-backed management contract stays in `agent-capability-settings`; this capability owns the observable page behavior on top of it.

## Requirements

### Requirement: Plugins page shows the installed plugin list with paged actions

The Plugins settings category SHALL present a top-level page whose content is the installed plugin list only. The list header row SHALL show a localized installed summary (`Installed N items`) at its left and two actions at its right: an `Install` button that opens the Install plugin page, and a `⋯` overflow menu containing Refresh all and a Marketplaces entry that opens the Marketplaces page. The page SHALL NOT render an inline market catalog, an add-marketplace input, or the marketplace list.

Each installed-plugin row SHALL show the plugin name on its first line and, on a second line as plain subtle text, `scope · marketplace · version` separated by `·` — no badges for scope or version. Rows SHALL NOT carry a delete action; removal lives on the plugin detail page. Each row SHALL end with: an enable/disable switch, then a chevron that opens the plugin detail page.

#### Scenario: Opening the pages from the Plugins page

- **WHEN** the user clicks `Install` in the list header
- **THEN** the content pane shows the Install plugin page with the breadcrumb `Plugins › Install plugin`

- **WHEN** the user opens the `⋯` menu and clicks Marketplaces
- **THEN** the content pane shows the Marketplaces page with the breadcrumb `Plugins › Marketplaces`

- **WHEN** the user clicks Refresh all in the `⋯` menu
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

The Marketplaces page (second level, breadcrumb `Plugins › Marketplaces`) SHALL list every registered marketplace, one row per marketplace with the name on the first line and `source-type · source` as subtle text on the second line. The list header SHALL show a registered count at its left and, at its right, an `Add` button opening the Add marketplace page and a `⋯` overflow menu with Refresh all. Marketplace rows SHALL NOT carry per-row refresh or delete actions.

Clicking a marketplace row SHALL open its detail page (third level, breadcrumb `Plugins › Marketplaces › <name>`). The detail page SHALL show an Info block (source type and source) and a plugin list of that marketplace's catalog entries — each entry with name, description, install count when known, an Installed badge when installed, and an Install button otherwise. The detail page's header SHALL have a Refresh action for this marketplace and a `⋯` overflow menu with Remove marketplace (destructive, with confirmation; removing uninstalls that marketplace's plugins per the CLI contract and returns to the Marketplaces page).

#### Scenario: Marketplace detail lists its plugins

- **WHEN** the user clicks the `zhbhun` marketplace row
- **THEN** the detail page opens at breadcrumb `Plugins › Marketplaces › zhbhun` showing its source (`directory · <path>`) and only the catalog entries whose marketplace is `zhbhun`

- **WHEN** the user clicks Remove marketplace on a marketplace detail page and confirms
- **THEN** the system runs the CLI marketplace removal and returns to the Marketplaces list with the removed entry gone

### Requirement: Add marketplace page with conditional Git ref

The Add marketplace page (third level under Marketplaces, breadcrumb `Plugins › Marketplaces › Add marketplace`) SHALL present a form with a Source field and, while the Source value looks like a git repository (a GitHub `owner/repo` shorthand or a `git@`/`https://` URL, and not a local path beginning with `/`, `~`, or `./`), a Git ref field. The Git ref field SHALL be hidden for local folder paths and while Source is empty; its hint explains that the value pins a branch or tag and is appended to the source as `#ref`.

Submitting SHALL pass the source (with `#<ref>` appended when a ref is set on a repo-looking source) to the CLI's marketplace add; a local path with a ref value set submits the path alone. Cancel and leaving via list-bound navigation follow the shared unsaved-changes guard. Failure SHALL surface the marketplace error toast.

#### Scenario: Git ref appears only for repo sources

- **WHEN** the user types `anthropics/claude-plugins-official` into Source
- **THEN** the Git ref field appears; typing `v2.0.0` into it and submitting adds the marketplace from `anthropics/claude-plugins-official#v2.0.0`

- **WHEN** the user replaces Source with `~/Projects/zhbhun/trading`
- **THEN** the Git ref field disappears and submitting adds the marketplace from the bare path

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

Clicking a catalog entry on the Install page SHALL open an install detail page (third level, breadcrumb `Plugins › Install plugin › <plugin name>`) with the same section layout as the plugin detail page — title with description, Skills, MCP servers, Subagents when known, and an Info block (author, version, marketplace, install count when known) — except its top-right action SHALL be an `Install` primary button for uninstalled entries, replaced by an Installed badge for installed ones. Installing SHALL surface the restart hint and update the entry state.

#### Scenario: Opening an install detail and installing

- **WHEN** the user clicks the `42crunch-api-security-testing` tile on the Install page
- **THEN** the install detail page opens at breadcrumb `Plugins › Install plugin › 42crunch-api-security-testing` with an Install button at the top right

- **WHEN** the user clicks Install there
- **THEN** the plugin installs, the restart hint appears, and the button is replaced by the Installed badge

### Requirement: Navigation and dirty guard follow the shared detail navigation

All pages and detail pages in the Plugins category SHALL follow the shared settings detail navigation: at most one page open at a time in the content pane, breadcrumb bar visible only on non-top-level pages with every intermediate level clickable, and unsaved form changes (the Add marketplace form) gated by the discard-confirmation dialog on list-bound navigation. The three-level depth (Add marketplace and marketplace detail under a second-level page) SHALL keep the breadcrumb rooted at the category name, with each breadcrumb segment returning to its page.

#### Scenario: Three-level breadcrumb navigation

- **WHEN** the user is on the Add marketplace page and clicks the `Marketplaces` breadcrumb segment
- **THEN** the content pane returns to the Marketplaces page (confirming the discard dialog first when the form has unsaved changes)

- **WHEN** the user is on a marketplace detail page and clicks the `Plugins` breadcrumb root
- **THEN** the content pane returns to the Plugins page
