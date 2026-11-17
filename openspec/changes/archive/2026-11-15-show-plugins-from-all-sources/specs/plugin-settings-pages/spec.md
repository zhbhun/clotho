# Spec Delta

## REMOVED Requirements

### Requirement: Catalog deduplication by plugin name
**Reason**: Same-name entries from different sources must be visible independently.
**Migration**: Show and manage entries by their full plugin ID.

## ADDED Requirements

### Requirement: Catalog entries by source

The catalog SHALL show one entry per plugin ID, including same-name plugins from different marketplaces, and SHALL use the full plugin ID for installed status and management actions.

#### Scenario: Same name in two sources

- **WHEN** the user searches All for a plugin present in two marketplaces
- **THEN** both entries are shown with their own source labels and actions

#### Scenario: Only one source is installed

- **WHEN** one of two same-name entries is installed
- **THEN** only that entry shows installed actions and the other offers installation

## MODIFIED Requirements

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

