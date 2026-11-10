# Spec Delta

## ADDED Requirements

### Requirement: Marketplace catalog retains the last successful result
The Marketplace Plugins tab SHALL retain the most recent successful catalog and installed-plugin results in memory for the renderer lifetime. On a subsequent visit, it SHALL display the cached catalog without a blocking loading indicator and revalidate both results in the background. An empty successful catalog SHALL count as a cached result.

#### Scenario: First visit
- **WHEN** the Plugins tab opens without a cached catalog
- **THEN** it shows a loading indicator until the catalog request completes

#### Scenario: Return to the catalog
- **WHEN** the user returns to the Plugins tab after a successful catalog load
- **THEN** the cached list appears without waiting for the new catalog request and fresh catalog and installed-plugin results replace their respective cached results when available

#### Scenario: Changes outside Clotho
- **WHEN** plugins or marketplaces change outside Clotho and the user subsequently visits the Plugins tab
- **THEN** background revalidation updates the displayed catalog and installed state from the CLI results

### Requirement: Catalog revalidation preserves usable results
A failed background request SHALL retain its last successful result and report the failure without replacing the catalog with a blocking loading or empty state. A failed first catalog request SHALL retain the existing load-error behavior. A later visit SHALL retry failed requests.

#### Scenario: Revalidation fails
- **WHEN** catalog revalidation fails while a cached catalog is displayed
- **THEN** the cached catalog remains usable, an error is reported, and a subsequent visit retries the request

#### Scenario: Successful empty result
- **WHEN** a revalidation succeeds with an empty catalog
- **THEN** the empty result replaces the previous catalog and the empty state is shown

### Requirement: Catalog state follows successful management operations
Successful install, uninstall, enable, disable, add, remove, or refresh operations performed in Clotho SHALL reconcile or invalidate the affected cached results so the catalog reflects the operation. Results from requests started before a successful operation SHALL NOT overwrite its effects.

#### Scenario: Plugin state changes
- **WHEN** a plugin is installed, removed, enabled, or disabled from any settings page
- **THEN** returning to Marketplace reflects the successful operation and older in-flight responses cannot restore the previous state

#### Scenario: Marketplace sources change
- **WHEN** a marketplace is added, removed, or refreshed successfully
- **THEN** the catalog is revalidated and reflects the changed sources without allowing an older response to replace the newer result
