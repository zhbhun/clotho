## Context

The Plugins page already exposes a PackagePlus marketplace action. Settings remounts MarketplaceSettings for a new visit and currently initializes every visit on Plugins.

## Decisions

Reuse the Plugins button styling in the installed Skills header, including when the list is empty. Route the action through Settings category selection and initialize that marketplace visit on Skills. Sidebar and Plugins entry points continue to initialize on Plugins.
