# Spec Delta

## MODIFIED Requirements

### Requirement: Catalog deduplication by plugin name

In the All sources view, when several catalog entries share a plugin name across sources, the page SHALL show exactly one entry, resolved by precedence: an entry whose plugin is installed wins over any uninstalled entry; among uninstalled entries, one from a user-registered marketplace wins over one from the built-in directory; remaining ties resolve deterministically (stable order by marketplace then plugin id). In that view, installed status SHALL be checked per plugin name, matching any `name@marketplace` install record.

#### Scenario: Same plugin in directory and a registered marketplace deduplicates

- **WHEN** the catalog contains `superpowers` from both the built-in directory and the registered `superpowers-marketplace`, and the installed record is `superpowers@superpowers-marketplace`
- **THEN** the list shows a single `superpowers` entry marked Installed (matching by plugin name), with `superpowers-marketplace` as its source label, and no second directory entry is shown

#### Scenario: Duplicate uninstalled entries prefer the registered marketplace

- **WHEN** the catalog contains `frontend-design` from both the built-in directory and the registered `claude-plugins-official`, and neither is installed
- **THEN** the list shows a single `frontend-design` entry with `claude-plugins-official` as its source label


### Requirement: Source filter and search on the unified catalog

The page SHALL render a source filter dropdown next to the search input, listing `All` (default) plus one option per distinct source in the full catalog. Selecting a source narrows the list to entries from that source before name deduplication; installed state and management actions in that view SHALL use the exact plugin ID; search text (name, description, and marketplace match) applies on top of the filter.

#### Scenario: Source filter narrows the list

- **WHEN** the user opens the source filter dropdown
- **THEN** it lists `All` followed by every distinct marketplace name present in the catalog in alphabetical order (the built-in directory `anthropic-plugin-directory` sorts in like any marketplace); selecting `zhbhun` shows only entries whose source label is `zhbhun`, and selecting `All` restores the full list

#### Scenario: Search applies on top of the source filter

- **WHEN** a source other than `All` is selected and the user types text into search
- **THEN** the list shows only entries from the selected source whose name, description, or marketplace matches the text


#### Scenario: Search a source containing a duplicate plugin

- **WHEN** `frontend-design` exists in the directory and official marketplace, and the user selects the directory and searches for `frontend-de`
- **THEN** the directory entry is shown, even if the All view selects the official marketplace entry

#### Scenario: Same-name installation belongs to another source

- **WHEN** the official marketplace entry is installed and the user selects the directory entry of the same name
- **THEN** the directory entry offers installation instead of actions for the other marketplace entry

#### Scenario: A source contains only duplicate names

- **WHEN** every plugin in a source shares a name with another source
- **THEN** the source remains selectable and its entries can be shown

