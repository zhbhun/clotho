## MODIFIED Requirements

### Requirement: Marketplaces page and marketplace detail page

The Marketplaces tab of Marketplace SHALL list every registered marketplace in borderless tiles with a name-derived letter avatar, name, optional marketplace description, and `source-type · source`, in that order. Tiles SHALL use two equal columns at the page's content width and one column on narrow windows, matching the plugin catalog's responsive layout. Names, descriptions, and sources SHALL truncate within their column. The list header SHALL show a registered count at its left and, at its right, an `Add` button opening the Add marketplace page and a `⋯` overflow menu with Refresh all. Marketplace tiles SHALL NOT carry per-row refresh or delete actions.

Clicking a marketplace tile SHALL open its detail page under Marketplace. The detail page SHALL show an Info block (source type and source) and a plugin list of that marketplace's catalog entries — each entry with name, description, install count when known, an Installed badge when installed, and an Install button otherwise. The detail page's header SHALL have a Refresh action for this marketplace and a `⋯` overflow menu with Remove marketplace (destructive, with confirmation; removing uninstalls that marketplace's plugins per the CLI contract and returns to the Marketplaces tab).

#### Scenario: Marketplace detail lists its plugins

- **WHEN** the user clicks the `zhbhun` marketplace tile
- **THEN** the detail page opens under Marketplace showing its source (`directory · <path>`) and only the catalog entries whose marketplace is `zhbhun`

- **WHEN** the user clicks Remove marketplace on a marketplace detail page and confirms
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

## ADDED Requirements

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
