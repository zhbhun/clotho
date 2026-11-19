## Why

Installed skills expose their instructions on disk, but the settings list only shows a truncated description. Users need to inspect the installed document before deciding whether to keep it.

## What Changes

- Present installed skills as borderless rows with avatars and a vertical actions menu.
- Open a read-only detail page from the row or its Open action.
- Show declared metadata above the rendered Markdown instructions and retain confirmed uninstall.

## Capabilities

### Modified Capabilities

- `agent-capability-settings` — installed skill browsing and document preview.

## Impact

Electron skill reader, desktop RPC, settings navigation and localized UI.
