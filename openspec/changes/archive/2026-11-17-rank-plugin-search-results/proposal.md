# Proposal

## Why

Search currently ranks solely by install count, so an exact name match without a count can appear below unrelated results.

## What Changes

- Rank search results by name match quality before install count.
- Keep the existing ordering when the search is empty.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Rank catalog search results by match quality.

## Impact

Marketplace catalog ordering and focused tests; no RPC or layout changes.
