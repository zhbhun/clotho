# Design

## Context

The existing marketplace detail uses local marketplace and catalog requests, separate installed-plugin state, card-based Info and plugin sections, and a dedicated Refresh button. Marketplace description is already read from each local manifest; its `owner.name` is not exposed. Plugin details provide a neutral identity, border-separated sections, and unboxed Info rows.

## Goals / Non-Goals

**Goals:** Apply the approved one-layout prototype to marketplace details, retain existing marketplace operations, and make installation state visible immediately.

**Non-Goals:** Add marketplace version, plugin search, pagination, sorting, plugin detail navigation, or change CLI installation/removal semantics.

## Decisions

1. Read `owner.name` along with the existing marketplace description from `<installLocation>/.claude-plugin/marketplace.json`; expose an optional owner name through the main/shared marketplace response. A missing, blank, invalid, or unreadable manifest yields no owner and never hides the market. Read each manifest once and retain the existing description fallback.
2. Reuse the plugin detail identity and section/Info primitives when their APIs fit; show neutral avatar, name, optional owner, description, full borderless plugin list with count and then Info. Keep the type and formatted source in Info. Align the loading skeleton with the new structure. The official market has 315 entries, so Info appears after a long list as in the approved prototype; no new collapse or paging behavior is introduced.
3. Move Refresh into the existing overflow menu and label the destructive action Uninstall marketplace. Preserve the current confirmation, CLI removal, cache reconciliation, and return navigation. Keep installed status as a badge; use the same `+` action appearance and install service as the catalog for uninstalled plugins.
4. When an installation succeeds, update the detail's installed state immediately, retaining retry on failure. Coordinate with the existing catalog cache so navigation and stale in-flight reads do not regress installed state.
5. The prototype demonstrates only preview interactions; it does not prescribe production component internals or execute marketplace operations.

## Risks / Trade-offs

- Missing metadata → omit owner and keep the available detail data.
- Long marketplace lists push Info down → this matches the approved prototype and keeps the full list; search and pagination remain separate future decisions.
- Install operations can overlap installed-list refreshes → apply the successful install state consistently with the existing cache's stale-response handling.
