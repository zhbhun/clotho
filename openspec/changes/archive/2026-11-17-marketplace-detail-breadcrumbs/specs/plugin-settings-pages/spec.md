## MODIFIED Requirements

### Requirement: Navigation and dirty guard follow the shared detail navigation

All plugin and Marketplace pages SHALL follow the shared settings detail navigation: at most one page open at a time in the content pane, breadcrumb bar visible only on non-top-level pages, and unsaved form changes (the Add marketplace form) gated by the discard-confirmation dialog on list-bound navigation. A catalog plugin detail SHALL use the localized Plugins tab label as its breadcrumb root; a marketplace detail SHALL use the localized Marketplaces tab label. Returning from a detail SHALL restore the tab from which it was opened. Add marketplace SHALL retain Marketplace as its breadcrumb root.

#### Scenario: Three-level breadcrumb navigation

- **WHEN** the user is on the Add marketplace page and returns to Marketplace
- **THEN** the Marketplaces tab is shown, confirming the discard dialog first when the form has unsaved changes

- **WHEN** the user returns from a catalog plugin detail
- **THEN** Marketplace shows the Plugins tab

- **WHEN** the user returns from a marketplace detail
- **THEN** Marketplace shows the Marketplaces tab

#### Scenario: Catalog plugin breadcrumb root

- **WHEN** a user opens a plugin detail from the Marketplace Plugins tab
- **THEN** the breadcrumb root shows the localized Plugins label and returns to that tab when clicked

#### Scenario: Marketplace detail breadcrumb root

- **WHEN** a user opens a marketplace detail from the Marketplaces tab
- **THEN** the breadcrumb root shows the localized Marketplaces label and returns to that tab when clicked

#### Scenario: Add marketplace breadcrumb root

- **WHEN** a user opens Add marketplace from the Marketplaces tab
- **THEN** the breadcrumb root retains the localized Marketplace category label and the existing dirty guard still applies
