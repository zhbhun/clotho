# Proposal

## Why

Both catalog plugin details and registered marketplace details currently use the sidebar category name as their breadcrumb root, so the label does not identify the list that the user came from.

## What Changes

- Show the localized Plugins tab label as the breadcrumb root for plugin details opened from the Marketplace Plugins list.
- Show the localized Marketplaces tab label as the breadcrumb root for marketplace details opened from the Marketplaces list.
- Preserve the existing root-click return behavior, selected tab, dirty guard, sidebar category, and breadcrumb labels for other pages, including Add marketplace.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `settings-detail-navigation`: Permit the two Marketplace detail pages to use their originating tab labels as breadcrumb roots.
- `plugin-settings-pages`: Specify the Plugins and Marketplaces detail breadcrumb labels and preserve their return destinations.

## Impact

Settings breadcrumb rendering and focused navigation tests. No RPC, data, or marketplace-management changes.
