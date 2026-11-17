# Proposal

## Why

The marketplace detail page uses card-based sections and repeats installation text for every plugin, making it visually inconsistent with plugin details and harder to scan in large markets. Its existing marketplace description is also not shown on the detail page.

## What Changes

- Use the approved plugin-detail-style layout: neutral identity avatar, title and available owner, marketplace description, borderless plugin section, and an information section.
- Put Refresh and Uninstall marketplace in the top-right overflow menu; retain the existing removal confirmation and behavior.
- Show a compact `+` action for each uninstalled plugin, while keeping installed state and install behavior.
- Read the marketplace owner name from its local manifest when available; retain the list and detail when metadata is absent or invalid.
- Preserve current plugin ordering, marketplace source formatting, plugin counts, and the full list; search, pagination, version fields, and plugin management changes are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Refresh the marketplace detail layout and management actions.

## Impact

Marketplace detail UI, loading presentation, local marketplace metadata and shared RPC types, translations, and focused tests. Claude CLI marketplace and plugin management operations remain unchanged.
