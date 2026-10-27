# Spec Delta

## MODIFIED Requirements

### Requirement: Subagent management

The system SHALL present the full set of subagents available to Clotho sessions on the Subagents settings page, resolved by querying the Claude Agent SDK for supported agents (covering built-in, plugin-provided, and custom subagents). The page SHALL keep a section heading row whose heading text is a localized installed summary — `Installed N items`, where `N` counts every resolved subagent and the `N items` part renders in subtle emphasis — with the Add action at its right end at default button size. Below the heading row, one shared scroll container SHALL stack three cards — built-in, plugin, custom, in that order — with generous spacing between the cards, and each card SHALL show a subtle-emphasis text-only source label (localized source name) above its rows. Each listed subagent SHALL indicate its source with an icon badge on its row. Built-in and plugin-provided subagents SHALL be displayed read-only and SHALL NOT offer edit or delete actions. Custom subagents (defined in `~/.claude/agents/*.md`) SHALL remain fully manageable: the user can create, edit, and delete them, the editor exposes the standard subagent frontmatter fields (name, description, tools, model) and the system prompt body, and deleting removes the markdown file. The available-subagent list SHALL be resolved when the page is opened and cached in the main process; the page SHALL NOT offer a manual refresh control nor poll in the background.

#### Scenario: Fresh machine shows built-in agents

- **WHEN** the user opens the Subagents settings page and `~/.claude/agents/` contains no files
- **THEN** the scroll container shows the Built-in card with the SDK-reported built-in subagents (at minimum `general-purpose`, `Explore`, `Plan`) each with a Built-in icon badge and no edit or delete controls, while the Custom card shows its empty hint

#### Scenario: Plugin subagents appear read-only

- **WHEN** an installed plugin registers subagents and the list is resolved
- **THEN** those subagents appear on the Plugin card with a Plugin icon badge and no edit or delete controls

#### Scenario: Custom subagent stays editable

- **WHEN** `~/.claude/agents/reviewer.md` exists and the list is resolved
- **THEN** the `reviewer` entry appears on the Custom card marked custom and offers the existing edit and delete actions, and its editor flow is unchanged

#### Scenario: Heading shows the installed count

- **WHEN** the resolved set contains N subagents and the page renders
- **THEN** the heading shows the localized `Installed N items` summary with the `N items` part in subtle emphasis, next to the Add action

#### Scenario: Cards carry a subtle text-only source label

- **WHEN** the scroll container renders the three cards
- **THEN** each card shows its localized source name as a subtle-emphasis text-only label above its rows

#### Scenario: Empty card shows its empty state

- **WHEN** a card's source has no subagents (for example no plugin registers agents)
- **THEN** that card still shows its source label and lists nothing but the shared empty hint

#### Scenario: Resolution failure keeps the page usable

- **WHEN** the SDK query fails while resolving the available subagents
- **THEN** the page surfaces the existing load-error feedback and still lists custom subagents from the file scan

#### Scenario: List subagents

- **WHEN** the user opens the subagents category
- **THEN** the system lists every `*.md` file in `~/.claude/agents/` with its name, description, and model, sourced from the file's frontmatter

#### Scenario: Create a subagent

- **WHEN** the user clicks Add in the section heading row and submits a new subagent with a name, description, optional tools/model, and a system prompt
- **THEN** the system writes `~/.claude/agents/<name>.md` with frontmatter and body, and the list shows the new subagent

#### Scenario: Delete a subagent

- **WHEN** the user deletes a subagent
- **THEN** the corresponding `~/.claude/agents/<name>.md` file is removed and the list no longer shows it

#### Scenario: Invalid frontmatter file

- **WHEN** a file in `~/.claude/agents/` has unparseable frontmatter
- **THEN** the list still shows the file (by filename) instead of failing the whole listing
