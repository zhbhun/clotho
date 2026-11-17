## ADDED Requirements

### Requirement: Marketplace source list retains the last successful result
The Marketplaces tab SHALL retain the last successful registered marketplace list in memory for the renderer lifetime. Subsequent visits SHALL display the cached list immediately and revalidate it in the background. An empty successful list SHALL count as cached. The list SHALL NOT wait for the plugin catalog.

#### Scenario: First visit
- **WHEN** the Marketplaces tab opens without a cached marketplace list
- **THEN** it shows a loading indicator until the marketplace list request completes

#### Scenario: Return to the list
- **WHEN** the tab opens after a successful list request
- **THEN** it shows the cached list without a blocking loading indicator and replaces it when revalidation succeeds

#### Scenario: Empty cached list
- **WHEN** the last successful result was empty and the tab is reopened
- **THEN** the empty state appears immediately while the list is revalidated

#### Scenario: Refresh failure
- **WHEN** a list revalidation fails with a cached result
- **THEN** the cached list remains visible, an error is reported, and a later visit retries

#### Scenario: Marketplace management
- **WHEN** a marketplace is added, removed, or refreshed successfully
- **THEN** the marketplace list is revalidated and earlier in-flight responses cannot replace the newer result
