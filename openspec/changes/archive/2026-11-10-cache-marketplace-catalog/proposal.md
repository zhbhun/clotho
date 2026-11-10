# Proposal

## Why

Reentering Marketplace discards its catalog and waits for a new Claude CLI process before showing any plugins. Retaining the last successful result makes repeat visits responsive while still detecting changes made outside Clotho.

## What Changes

- Keep the last successful catalog and installed-plugin state in memory across Marketplace navigation during the renderer lifetime.
- Show cached results immediately on subsequent visits while revalidating in the background; keep the initial loading and error experience when no result exists.
- Reconcile successful plugin and marketplace operations with cached state, prevent older requests from overwriting newer changes, and retain usable data if revalidation fails.
- Preserve the current default tab, navigation, catalog ordering, and CLI as the source of truth.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Define catalog caching, revalidation, and failure behavior during Marketplace navigation.

## Impact

Marketplace settings and plugin/marketplace mutation paths in the renderer; existing desktop RPC and Claude CLI contracts remain unchanged. No persistent cache or new dependency is required.
