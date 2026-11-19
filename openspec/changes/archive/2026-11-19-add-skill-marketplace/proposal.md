# Proposal

## Why

Users can discover plugins inside Settings, but must leave Clotho to find and install an individual Claude Code skill. A public ranking snapshot and a bundled search tool can support discovery without asking users for service credentials.

## What Changes

- Add a Skills catalog to Marketplace with the eight supported LinklyAI/best-skills rankings, defaulting to best-100.
- Search the wider catalog through the locally bundled skills CLI.
- Install a selected skill for the current user's Claude Code projects and surface it in the existing Skills settings category.

## Capabilities

### New Capabilities

- `skill-marketplace` owns ranked discovery, remote search through the local CLI, and installation from catalog results.

### Modified Capabilities

- `plugin-settings-pages` adds Skills to Marketplace navigation.

## Impact

Touches Settings, locale strings, shared desktop RPC, preload, main-process skill management and Forge packaging. Adds a pinned skills runtime and a CSV parser. Ranking reads use GitHub Raw and CLI search uses skills.sh.
