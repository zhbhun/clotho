# Design

## Context

The existing settings sidebar owns the active category; the shared detail store owns detail pages and dirty-form navigation. `AgentPluginSettings` currently hosts both the installed list and the catalog/source subpages. The repository already has a Base UI-backed shadcn Tabs component and the plugin operations and catalog data are supplied through the existing desktop bridge. See the proposal and delta spec for the requested behavior.

## Goals / Non-Goals

**Goals:** Make Marketplace a distinct category while retaining the current catalog and source-management capabilities and their navigation safeguards.

**Non-Goals:** Change plugin CLI behavior, catalog contents, persistence, install semantics, or introduce a new service.

## Decisions

- Add a dedicated Marketplace category immediately above Plugins. Route the Plugins list action through the same category-selection flow as the sidebar, rather than opening a plugin detail page, so the selected category and content agree.
- Render the existing catalog and marketplace list as the two panels of `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` from `@/shadcn/tabs`, using its default capsule variant centered in the content column. Hide the usual category heading for this page. The earlier standalone HTML prototype is layout guidance, not a component implementation.
- Move catalog and source detail navigation under the Marketplace category, preserving the category's source tab when returning from a marketplace detail or add form and the Plugins tab when returning from a catalog detail. Entering through the sidebar or Plugins action starts on Plugins. Keep plugin-installed details under Plugins. Reuse the shared detail store and discard confirmation rather than introducing a parallel navigation mechanism.
- Reuse existing catalog/list/detail components and bridge methods. Adapt breadcrumb roots and their return targets to the new category, and preserve marketplace refresh, add, removal, install and enable-state behavior. Avoid duplicating the catalog or source lists.

## Risks / Trade-offs

- [Category changes can bypass the dirty form guard] → Route sidebar and breadcrumb departures through the existing guard and cover discard/cancel behavior in affected tests.
- [Existing pages assume the Plugins category or a three-level hierarchy] → Update their detail navigation consistently and test returns to the originating Marketplace tab.
- [The HTML mock uses sample data and custom markup] → Use the actual shadcn component and real desktop services in implementation; do not promote prototype code.

## Migration Plan

This is a renderer navigation change with no persisted data migration. Roll back by reverting the renderer and localization changes together; existing CLI state remains intact.
