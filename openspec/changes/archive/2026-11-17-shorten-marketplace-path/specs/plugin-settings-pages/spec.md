## ADDED Requirements

### Requirement: Directory marketplace path uses a home abbreviation
Marketplace list and detail SHALL display a macOS `/Users/<user>` prefix in directory source paths as `~`, consistent with other displayed paths. Paths without that prefix SHALL remain unchanged; the underlying source path SHALL remain unchanged.

#### Scenario: Home directory path
- **WHEN** a directory marketplace source path is `/Users/alice/Projects/trading`
- **THEN** its list row and detail source display `~/Projects/trading`

#### Scenario: Other directory path
- **WHEN** a directory marketplace source path is `/opt/plugins`
- **THEN** its list row and detail source display `/opt/plugins`
