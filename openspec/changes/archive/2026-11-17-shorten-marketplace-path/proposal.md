# Proposal

## Why

Directory marketplace paths can be lengthy and currently expose the full macOS home prefix in the source display.

## What Changes

- Shorten the macOS home prefix to `~` in marketplace list and detail displays using the existing path formatter.
- Keep the original path in marketplace data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Shorten displayed directory source paths.

## Impact

Shared renderer path display utility and marketplace settings rendering. No CLI or data changes.
