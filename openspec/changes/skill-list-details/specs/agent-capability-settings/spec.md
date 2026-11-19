## MODIFIED Requirements

### Requirement: Skill management

The system SHALL list user-level skills under `~/.claude/skills/`, including directories reached through absolute or relative symbolic links, when `SKILL.md` is readable. The entry name SHALL identify the skill and its frontmatter SHALL supply the description. The system SHALL present borderless single-column rows with a letter avatar, title, description and a vertical actions menu containing Open and Uninstall. Both the row and Open SHALL open the same read-only detail page. Uninstall SHALL require confirmation. Deleting a symbolic-link installation SHALL remove the link and preserve its target directory.

#### Scenario: List skills

- **WHEN** the user opens the skills category
- **THEN** the system lists each `~/.claude/skills/<name>/SKILL.md` with its name and description

#### Scenario: Delete a skill

- **WHEN** the user deletes a skill
- **THEN** the skill's directory under `~/.claude/skills/` is removed and the list no longer shows it

#### Scenario: Directory without SKILL.md

- **WHEN** a directory under `~/.claude/skills/` contains no `SKILL.md`
- **THEN** it is not listed as a skill and the listing does not fail

#### Scenario: List skills installed through symbolic links

- **WHEN** an absolute or relative symbolic link under `~/.claude/skills/` points to a directory containing a readable `SKILL.md`
- **THEN** the skill is listed using the installation link's name and the target file's description

#### Scenario: Skip invalid symbolic-link installations

- **WHEN** a symbolic link is broken, points to a file, or points to a directory without a readable `SKILL.md`
- **THEN** the entry is skipped and other valid skills are still listed

#### Scenario: Delete a symbolic-link installation

- **WHEN** the user deletes a skill installed through a symbolic link
- **THEN** the link under `~/.claude/skills/` is removed and the skill disappears from the list
- **AND** the target directory and its contents are preserved

#### Scenario: Inspect an installed skill

- **WHEN** a user opens a skill from its row or menu
- **THEN** the detail page displays declared name, description, license, version and author when present above the rendered Markdown body, with breadcrumb navigation back to the list
