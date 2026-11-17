# Proposal

## Why

Prefix matches of very different lengths currently rank by popularity, placing a less complete match ahead of a shorter, more relevant name.

## What Changes

- Rank shorter name-prefix matches first; use the existing popularity ordering for ties.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Refine catalog prefix-match ranking.

## Impact

Marketplace search ranking and targeted tests; no IPC or layout changes.
