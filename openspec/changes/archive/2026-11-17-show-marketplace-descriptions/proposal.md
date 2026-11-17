# Proposal

## Why

The registered marketplace list identifies sources but does not show what each marketplace offers, even when a local marketplace manifest provides a description.

## What Changes

- Read each registered marketplace's description from its local marketplace manifest and expose it to the settings page.
- Present marketplaces as borderless, two-column tiles matching the plugin catalog: letter avatar, name, description, and source, collapsing to one column on narrow windows.
- Preserve marketplace navigation, source details, refresh behavior, and usable lists when a description is unavailable.
- Market version display is out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Show descriptions and use the selected borderless marketplace list layout.

## Impact

The main-process marketplace list, shared RPC response, settings list and loading presentation, and focused tests. Data comes from local CLI-managed files; no new service or dependency is required.
