# Spec Delta: plugin-settings-pages

## MODIFIED Requirements

### Requirement: Plugin detail page

The system SHALL open a plugin detail page (second level, breadcrumb `Plugins › <plugin name>`) from an installed plugin row's chevron. The page SHALL show the plugin name as its title — the display name when a marketplace snapshot or manifest provides one, otherwise the plugin name — with the plugin's description below it, followed by these sections in order: Skills (each skill's name and description), Commands (each command's name and description), MCP servers (each server's name and a command or URL summary), Subagents (each subagent's name and description), and Hooks (each hook's event name and a summary when known); a section with no entries SHALL be omitted. An Info block follows with author, category (when known), version, marketplace, root path, and installed date. The Info block SHALL NOT be collapsed, and each Info row whose value is unknown SHALL be omitted individually.

Detail data SHALL come from a dedicated RPC that the main process assembles from four sources in increasing precedence — the marketplace-snapshot entry, the CLI catalog-cache entry, the plugin's install-path manifests (`plugin.json`, `skills/`, `agents/`, `.mcp.json`), and the installed-plugin record: snapshot and catalog-cache sources fill fields the installed data lacks (author, category, homepage, display name, version, keywords, and component lists for uninstalled plugins), and a plugin whose manifests cannot be read SHALL still open with the installed record's fields and whatever component sections those sources provide.

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

## ADDED Requirements

### Requirement: Catalog entries carry version

The unified catalog feed SHALL keep the `version` field the CLI's available-plugins output provides, and catalog detail pages SHALL display it in their Info blocks when present.

#### Scenario: Version flows to detail

- **WHEN** the CLI lists an available catalog entry with `version: "1.5.5"` and the user opens its install detail
- **THEN** the Info block shows version 1.5.5
