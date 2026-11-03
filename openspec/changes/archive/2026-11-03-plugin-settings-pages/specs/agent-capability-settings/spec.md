# Spec Delta

## MODIFIED Requirements

### Requirement: Plugin management

The system SHALL manage plugins by invoking the Claude Code CLI's `plugin` subcommands (the same binary Clotho sessions spawn), using the resolved Claude Code binary. The system SHALL list installed plugins from `claude plugin list --json` (id, name, marketplace, version, scope, install path, enabled state, and any install notes) and browse the market catalog from `claude plugin list --available --json` (plugin id, name, description, marketplace, install count). The system SHALL let the user enable or disable a plugin via `claude plugin enable/disable`, which records the state in `enabledPlugins` in `~/.claude/settings.json` shared with all Claude Code surfaces; plugin enable state SHALL NOT be tracked in Clotho's own settings. The system SHALL let the user install a plugin from the market catalog via `claude plugin install <plugin@marketplace>` and remove an installed plugin via `claude plugin uninstall`. The system SHALL let the user add a marketplace from any CLI-supported source via `claude plugin marketplace add` (with an optional git ref appended to the source as `#ref` when the source names a git repository), remove one via `claude plugin marketplace remove`, and refresh marketplaces via `claude plugin marketplace update`. Because plugin changes only take effect for newly started sessions, the system SHALL surface a restart hint after install, uninstall, enable, and disable.

The Plugins settings presentation — page structure, navigation, row layout, and detail pages — is defined by `plugin-settings-pages` and SHALL follow that capability's requirements.
