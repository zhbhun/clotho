# Spec Delta

## ADDED Requirements

### Requirement: Marketplace settings category and tabs

The settings sidebar SHALL show Marketplace immediately above Plugins. Marketplace SHALL show centered capsule-style Plugins and Marketplaces tabs at the top without a separate page title. Plugins SHALL be selected when entering Marketplace from the sidebar or Plugins action, and the selected sidebar category SHALL remain Marketplace while either tab is open.

#### Scenario: Enter Marketplace from the sidebar

- **WHEN** the user selects Marketplace in the sidebar
- **THEN** Marketplace is selected in the sidebar, Plugins is selected in the centered tabs, and the plugin catalog is shown

#### Scenario: Switch to marketplace sources

- **WHEN** the user selects the Marketplaces tab
- **THEN** the registered marketplace list is shown and Marketplace remains selected in the sidebar

## MODIFIED Requirements

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
