# Spec Delta

## MODIFIED Requirements

### Requirement: Plugin management

The system SHALL manage plugins by invoking the Claude Code CLI's `plugin` subcommands (the same binary Clotho sessions spawn), using the resolved Claude Code binary. The system SHALL list installed plugins from `claude plugin list --json` (id, name, marketplace, version, scope, install path, enabled state, and any install notes) and browse the market catalog from `claude plugin list --available --json` (plugin id, name, description, marketplace, install count). The system SHALL let the user enable or disable a plugin via `claude plugin enable/disable`, which records the state in `enabledPlugins` in `~/.claude/settings.json` shared with all Claude Code surfaces; plugin enable state SHALL NOT be tracked in Clotho's own settings. The system SHALL let the user install a plugin from the market catalog via `claude plugin install <plugin@marketplace>` and remove an installed plugin via `claude plugin uninstall`. The system SHALL let the user add a marketplace from any CLI-supported source via `claude plugin marketplace add`, remove one via `claude plugin marketplace remove`, and refresh marketplaces via `claude plugin marketplace update`. Because plugin changes only take effect for newly started sessions, the system SHALL surface a restart hint after install, uninstall, enable, and disable.

#### Scenario: List installed plugins

- **WHEN** the user opens the plugins category
- **THEN** the system lists the plugins reported by `claude plugin list --json` with name, marketplace, version, scope, and enabled state, and shows any install notes the CLI reported for a plugin

#### Scenario: Browse the market catalog

- **WHEN** the user browses available plugins on the plugins page
- **THEN** the system shows the catalog entries from `claude plugin list --available --json` with name, description, marketplace, and install count, and offers installing an uninstalled entry

#### Scenario: Enable or disable a plugin via the CLI state

- **WHEN** the user toggles a plugin
- **THEN** the system runs `claude plugin enable` or `claude plugin disable`, the plugin's entry in `~/.claude/settings.json` `enabledPlugins` is updated to `true` or `false`, and Clotho's own settings store no per-plugin enable state

#### Scenario: Enable state agrees with the CLI

- **WHEN** a plugin is enabled or disabled through Clotho and the user runs `claude plugin list --json` in a terminal
- **THEN** the reported enabled state matches what Clotho shows

#### Scenario: Install a plugin from the catalog

- **WHEN** the user installs a plugin from the market catalog
- **THEN** the system runs `claude plugin install <plugin>@<marketplace>`, the CLI records the install in `installed_plugins.json` with its resolved version, and the UI shows the restart hint

#### Scenario: Uninstall a plugin

- **WHEN** the user removes an installed plugin
- **THEN** the system runs `claude plugin uninstall <id>` and the UI shows the restart hint

#### Scenario: Add a marketplace

- **WHEN** the user adds a marketplace from a source the CLI supports (git URL, GitHub repo, local path, or URL)
- **THEN** the system runs `claude plugin marketplace add <source>` and the marketplace appears in the marketplace list

#### Scenario: Refresh marketplaces

- **WHEN** the user refreshes a marketplace (or all marketplaces)
- **THEN** the system runs `claude plugin marketplace update [name]`, the marketplace's local checkout is updated from its source, and the catalog view reflects the refreshed data

#### Scenario: Remove a marketplace

- **WHEN** the user removes a marketplace
- **THEN** the system runs `claude plugin marketplace remove <name>` and the marketplace disappears from the list

#### Scenario: Restart hint after a change

- **WHEN** an install, uninstall, enable, or disable completes
- **THEN** the UI shows a localized hint that the change applies to new sessions, and running sessions are unaffected

#### Scenario: Enable or disable a plugin for Clotho sessions

- **WHEN** the user toggles a plugin
- **THEN** the toggle is recorded in the CLI's `enabledPlugins` in `~/.claude/settings.json` and Clotho sessions start (or stop) loading the plugin accordingly

#### Scenario: Add and remove a marketplace

- **WHEN** the user adds a marketplace from a CLI-supported source (git URL, GitHub repo, local path, or URL), or removes one
- **THEN** the marketplace is registered (or unregistered and its checkout deleted) under `~/.claude/plugins/` by the CLI

#### Scenario: Install a plugin from a marketplace

- **WHEN** the user installs a plugin from a marketplace
- **THEN** the CLI installs the plugin into the installed plugins cache and records it in `installed_plugins.json` with its resolved version

#### Scenario: CLI missing or failing

- **WHEN** the Claude Code binary cannot be resolved or a `plugin` command exits non-zero
- **THEN** the operation reports the CLI's error to the renderer as a per-request error and the page stays usable
