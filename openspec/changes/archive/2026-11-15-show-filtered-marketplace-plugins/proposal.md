# Proposal

## Why

Global name deduplication hides plugins from their actual marketplace when users filter by source.

## What Changes

- Show each selected marketplace's own catalog entries, including names also present elsewhere.
- Keep the unified All view deduplicated and preserve all available source options.
- Use the selected entry's installation identity for its actions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Source filtering exposes entries from the chosen marketplace before name deduplication.

## Impact

The Marketplace Plugins tab and its tests; no IPC changes.
