# Design

## Context

The settings page currently derives every breadcrumb root from the selected sidebar category. Marketplace opens plugin and marketplace details with distinct `page` values in the shared detail store; the selected tab remains mounted in `MarketplaceSettings` across detail navigation.

## Goals / Non-Goals

**Goals:** Label each requested detail according to the list that opened it while keeping existing navigation and localization behavior.

**Non-Goals:** Rename the Marketplace sidebar category, alter Add marketplace breadcrumbs, or change the detail store's navigation and dirty guard.

## Decisions

Derive the breadcrumb root label in the existing settings page from the detail category, page type and presence of a detail entry: `agent-marketplace` / `install` with an entry uses `settings.agent.title.plugins`; `agent-marketplace` / `marketplaces` with an entry uses `settings.agent.plugins.marketplaces`. Other views fall back to their existing category label. This avoids changing the sidebar or adding state, and reuses the existing localized tab labels.

Keep the current root click handler and tab state; only the displayed root label changes. The temporary prototype illustrates the two labels, their return destinations and the unaffected Add marketplace case.

## Risks / Trade-offs

- Marketplace Add uses the same `marketplaces` page type with no file → check the entry before selecting the Marketplaces label so its existing breadcrumb and dirty guard remain unchanged.
- Localized Plugins appears in other contexts → scope the override to the Marketplace category and relevant detail pages.
