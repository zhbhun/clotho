# Spec Delta

## MODIFIED Requirements

### Requirement: Deterministic catalog ordering

Without search text, catalog ordering SHALL be deterministic: by install count descending (entries without a known count last), then alphabetical by plugin name. With nonempty search text, matching entries SHALL first be ordered by case-insensitive name match: exact name, name prefix, name substring, then description or marketplace matches. Within the name-prefix group, shorter names SHALL appear first; names of equal length SHALL retain the default catalog ordering. Within every other group the default catalog ordering SHALL apply.

#### Scenario: Ordering across entry kinds

- **WHEN** the catalog contains an entry with 500 installs, an entry with no install count, and an entry with 1200 installs, all names distinct, and no search text is entered
- **THEN** the list shows the 1200-install entry first, then the 500-install entry, then the no-count entry; entries with equal install counts appear in alphabetical name order, stable across reloads

#### Scenario: Search ranks exact matches before popularity

- **WHEN** the user searches `superpowers`, and the catalog has two entries named `superpowers` from different marketplaces, an entry named `superpowers-extra`, and another matching only in its description
- **THEN** the two exact name matches appear first, ordered by install count, followed by the prefix match and then the description match regardless of those entries' install counts

#### Scenario: Partial name and marketplace matches

- **WHEN** a search matches one plugin at the start of its name, another within its name, and a third only in its marketplace name
- **THEN** the prefix match appears before the name substring match, which appears before the marketplace match

#### Scenario: Search ignores casing and surrounding whitespace

- **WHEN** the search text contains surrounding spaces or uppercase letters
- **THEN** ranking and matching use the trimmed, case-insensitive text

#### Scenario: Shorter prefix matches rank higher

- **WHEN** the user searches `superpower`, and `superpowers` exists in two marketplaces while `superpower-builder` has more installs than one of them
- **THEN** both `superpowers` entries appear before `superpower-builder`, with same-length matches ordered by install count

