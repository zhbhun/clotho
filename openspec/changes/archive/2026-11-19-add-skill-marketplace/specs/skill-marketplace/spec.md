# Spec Delta

## Purpose

Let users discover individual skills in Settings and install them for Claude Code across their projects.

## ADDED Requirements

### Requirement: Browse skill rankings

Marketplace Skills SHALL offer exactly the eight supported charts and default to best-100. It SHALL read public LinklyAI/best-skills ranking CSVs without credentials and display snapshot attribution.

#### Scenario: Browse the latest snapshot

- **WHEN** a user opens Marketplace Skills
- **THEN** the list shows best-100 entries in their published order

#### Scenario: Browse a published cross-platform chart

- **WHEN** the user chooses best-100, top-installs, trending-7d, social-buzz, most-active, official-100, top-repos or rising-stars
- **THEN** the marketplace reads the corresponding latest public ranking CSV, keeps its numeric rank order and shows the chart-specific metric
- **AND** each chart has its own last-known-good cache, and repository rows offer no skill installation

#### Scenario: Open a skill title

- **WHEN** the user hovers over a ranking or search title with a published URL
- **THEN** the title is underlined and clicking it opens that URL in the system browser

#### Scenario: Ranking source unavailable

- **WHEN** fetching or parsing the ranking snapshot fails
- **THEN** the last valid snapshot remains browsable if available, otherwise a retryable unavailable state appears and the search field remains usable

### Requirement: Search beyond the rankings

A nonempty query SHALL search through the locally bundled skills find command, show results in CLI order, and allow results absent from all rankings. Clearing the query SHALL restore the previously selected ranking.

#### Scenario: Discover an unranked skill

- **WHEN** the user types a query while browsing trending-7d and the CLI returns a skill absent from the snapshot
- **THEN** that result offers installation and clearing the query restores trending-7d

#### Scenario: Superseded query

- **WHEN** an earlier search completes after the query was changed or cleared
- **THEN** its response does not replace the current results or ranking

### Requirement: Install one user-level skill

A skill ranking or search result with a supported install source SHALL offer installation of the selected skill for Claude Code at user scope. The system SHALL report success only after confirming the installation and expose the skill in the existing Skills settings list.

#### Scenario: Install from a multi-skill repository

- **WHEN** a user selects + on one skill in a repository that publishes several skills
- **THEN** that skill alone is installed for Claude Code across projects and its row reflects the installed state

#### Scenario: Installation fails

- **WHEN** installation fails
- **THEN** Clotho reports the failure and the user can retry without losing the active query or ranking

#### Scenario: Manage a conflicting local skill

- **WHEN** a result matches a local skill directory with unknown or different provenance
- **THEN** its vertical ellipsis menu offers Open for the local skill details and Uninstall for the local user installation
- **WHEN** the user confirms removal
- **THEN** the current ranking or search offers installation for the newly available name
