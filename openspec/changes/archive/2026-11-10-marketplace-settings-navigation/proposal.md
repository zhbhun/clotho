# Proposal

## Why

Plugin discovery is currently buried under the installed Plugins page. A dedicated Marketplace entry makes browsing available plugins and managing their sources easier to find.

## What Changes

- Add Marketplace above Plugins in the settings sidebar and make the Plugins page's upper-right install action navigate to it.
- Put the existing plugin catalog and marketplace source management under centered, capsule-style Plugins and Marketplaces tabs, defaulting to Plugins.
- Retain installed-plugin management under Plugins and preserve existing catalog and source-management operations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-settings-pages`: Change the navigation and organization of the catalog and marketplace management pages.

## Impact

Settings navigation, plugin pages, detail breadcrumbs, localized strings, and focused tests are affected. Existing CLI-backed RPC operations remain in use.
