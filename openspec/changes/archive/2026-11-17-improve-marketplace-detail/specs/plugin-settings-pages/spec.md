## MODIFIED Requirements

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

### Requirement: Directory marketplace source path

The marketplace list and detail SHALL display a directory marketplace's local source path when the CLI provides it. If the path is unavailable, they SHALL retain the existing source-type fallback.

#### Scenario: Directory marketplace with a path
- **WHEN** a registered marketplace has source type `directory` and a local source path
- **THEN** its list tile shows `directory · <path>` and its detail Info source shows `<path>`

#### Scenario: Directory marketplace without a path
- **WHEN** a directory marketplace has no source path
- **THEN** its list row and detail show the source type without an invented path

## ADDED Requirements

### Requirement: Marketplace owner comes from the local manifest

The marketplace detail SHALL show the nonempty owner name from the local marketplace manifest when available. Missing, unreadable, invalid, or incomplete manifests SHALL leave the owner absent without preventing marketplace details from loading.

#### Scenario: Owner name available

- **WHEN** the marketplace manifest contains a nonempty `owner.name`
- **THEN** the detail shows that owner in its identity and Info sections

#### Scenario: Owner unavailable

- **WHEN** the owner name or manifest is absent or invalid
- **THEN** the detail omits the owner and continues to show its available information
