## ADDED Requirements

### Requirement: Directory marketplace source path
The marketplace list and detail SHALL display a directory marketplace's local source path when the CLI provides it. If the path is unavailable, they SHALL retain the existing source-type fallback.

#### Scenario: Directory marketplace with a path
- **WHEN** a registered marketplace has source type `directory` and a local source path
- **THEN** its list row and detail header show `directory · <path>` and the detail Info source shows `<path>`

#### Scenario: Directory marketplace without a path
- **WHEN** a directory marketplace has no source path
- **THEN** its list row and detail show the source type without an invented path
