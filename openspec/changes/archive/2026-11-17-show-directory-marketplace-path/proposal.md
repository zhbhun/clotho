# Proposal

## Why

Directory marketplace sources show only their type because the CLI's path is dropped before it reaches the settings UI.

## What Changes

- Preserve the CLI's directory source path and display it in marketplace list and detail views.
- Keep existing source display when no path is available.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Display a directory marketplace's source path.

## Impact

Marketplace RPC contract and mapping, settings views, and focused tests. No filesystem or marketplace changes.
