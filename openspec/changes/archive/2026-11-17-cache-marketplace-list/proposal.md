# Proposal

## Why

Returning to the Marketplaces tab shows a blocking loading state on every visit, even after the registered sources were loaded successfully. The list also waits for the unrelated plugin catalog.

## What Changes

- Retain the most recent successful marketplace list in renderer memory and revalidate it on visits.
- Show cached results during refresh and preserve them on failure; treat an empty result as cached.
- Fetch only the marketplace list on the list page and reconcile successful marketplace management operations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Define marketplace list caching and revalidation behavior.

## Impact

Settings renderer marketplace list and cache, marketplace management refresh flow, and focused tests. No IPC changes or persistence.
