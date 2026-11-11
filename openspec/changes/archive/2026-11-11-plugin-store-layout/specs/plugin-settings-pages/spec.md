# Spec Delta

## MODIFIED Requirements

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
