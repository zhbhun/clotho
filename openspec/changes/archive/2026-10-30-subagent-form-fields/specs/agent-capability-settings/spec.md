# Spec Delta

## MODIFIED Requirements

### Requirement: Subagent management

The system SHALL present the full set of subagents available to Clotho sessions on the Subagents settings page, resolved by querying the Claude Agent SDK for supported agents (covering built-in, plugin-provided, and custom subagents). The page SHALL keep a section heading row whose heading text is a localized installed summary — `Installed N items`, where `N` counts every resolved subagent and the `N items` part renders in subtle emphasis — with the Add action at its right end at default button size. Below the heading row, one shared scroll container SHALL stack three cards — built-in, plugin, custom, in that order — with generous spacing between the cards, and each card SHALL show a subtle-emphasis text-only source label (localized source name) above its rows. Each listed subagent SHALL indicate its source with an icon badge on its row: a Claude mark for built-in subagents, a puzzle icon for plugin-provided subagents, and a person icon for custom subagents. Built-in and plugin-provided subagents SHALL be displayed read-only and SHALL NOT offer edit or delete actions. Custom subagents (defined in `~/.claude/agents/*.md`) SHALL remain fully manageable: the user can create, edit, and delete them, and deleting removes the markdown file.

Each custom-subagent row SHALL show, from left to right: the source icon badge, the subagent name, the description (single line, truncating), a model label that shows the localized `default` tag when no model is declared or the declared model with its first letter capitalized, and a chevron button that opens the editor for that subagent. A custom subagent whose file is broken (unparseable frontmatter) SHALL show the broken hint instead of the description and a row delete button instead of the chevron — the editor cannot open it, so the row is its only removal path. Non-broken rows SHALL NOT carry a delete action; deletion happens inside the editor.

The editor SHALL present, in order: the Name field on its own row (a text input whose placeholder states the naming rules concisely, with no hint line below), the Description as a single-line textarea (Enter key and pasted newlines are stripped), an "Advanced options" collapsible section, the system prompt body as a multi-line textarea, and a footer row with a danger-styled Delete button on the left and Cancel and Save buttons on the right. The Advanced options section SHALL start expanded when editing a subagent that has any advanced field set, and collapsed otherwise, and its header SHALL show a count of currently-set advanced fields. It SHALL expose:

- Model: a select with values `default`, `sonnet`, `opus`, `haiku`, `inherit` (replacing the previous free-text input).
- Permission mode: a select with values `inherit`, `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`.
- Reasoning effort: a select with values `inherit`, `low`, `medium`, `high`, `xhigh`, `max`.
- Max turns: a number input (empty = unlimited).
- Tools: a mode select — `all tools` (no `tools` field written; all tools inherited) or `custom` — plus, when `custom`, a three-column checkbox grid of common tools (Read, Grep, Glob, Bash, Edit, Write, WebFetch, WebSearch, TodoWrite) whose checked names form the `tools` allowlist. Custom tools not in the grid that exist in the file's `tools` field SHALL be preserved in that field when saving from the grid.
- Disallowed tools: a comma-separated text input; each entry removes the whole matching tool.
- Skills: a comma-separated text input of skill names to preload.
- Run in background: a switch (on = `background: true`).
- Skip CLAUDE.md: a switch (on = `omitClaudeMd: true`).
- Memory: a select with values `none`, `user`, `project`, `local`.
- Color: a select with the fixed set `none`, `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`.
- File isolation: a switch (on = `isolation: worktree`).

The editor SHALL NOT expose `mcpServers`, `hooks`, `experimental`, `initialPrompt`, or `autoCompactWindow`; when present in an existing file these keys SHALL be preserved verbatim on save, together with any other unrecognized frontmatter keys.

The available-subagent list SHALL be resolved when the page is opened and cached in the main process; the page SHALL NOT offer a manual refresh control nor poll in the background. UI copy for the new fields is authored in English, with zh-CN/zh-TW translations filled in; enum values that are written to the file (`inherit`, `none`, model IDs, permission modes, efforts) stay verbatim lowercase literals in every locale, while UI-only labels are translated.

#### Scenario: Fresh machine shows built-in agents

- **WHEN** the user opens the Subagents settings page and `~/.claude/agents/` contains no files
- **THEN** the scroll container shows the Built-in card with the SDK-reported built-in subagents (at minimum `general-purpose`, `Explore`, `Plan`) each with a Claude-mark icon badge and no edit or delete controls, while the Custom card shows its empty hint

#### Scenario: Plugin subagents appear read-only

- **WHEN** an installed plugin registers subagents and the list is resolved
- **THEN** those subagents appear on the Plugin card with a puzzle icon badge and no edit or delete controls

#### Scenario: Custom subagent opens via chevron

- **WHEN** `~/.claude/agents/reviewer.md` exists and the user clicks the chevron on the `reviewer` row
- **THEN** the editor opens for that subagent with its fields populated

#### Scenario: Custom subagent stays editable

- **WHEN** `~/.claude/agents/reviewer.md` exists and the list is resolved
- **THEN** the `reviewer` entry appears on the Custom card marked custom and offers the chevron that opens its editor flow

#### Scenario: Model label shows Default or the capitalized model

- **WHEN** a custom subagent declares no model, and another declares `sonnet`
- **THEN** the first row shows the localized `default` tag while the second shows `Sonnet`

#### Scenario: Delete lives in the editor footer

- **WHEN** the user opens a custom subagent in the editor and clicks Delete, confirming the confirmation dialog
- **THEN** the corresponding `~/.claude/agents/<name>.md` file is removed and the list no longer shows it

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
- **THEN** the system lists every `*.md` file in `~/.claude/agents/` with its name, description, model, and the extended frontmatter fields, and marks unparseable files as broken

#### Scenario: Create a subagent

- **WHEN** the user clicks Add in the section heading row and submits a new subagent with a name, description, optional advanced fields, and a system prompt
- **THEN** the system writes `~/.claude/agents/<name>.md` with frontmatter reflecting the editor state and body, and the list shows the new subagent

#### Scenario: Tools mode writes or omits the tools field

- **WHEN** the user saves with tools mode `all tools`, and with mode `custom` and a subset of grid tools checked
- **THEN** the first save writes no `tools` field and the second writes `tools` as the checked tool names

#### Scenario: Boolean and enum fields serialize to frontmatter

- **WHEN** the user sets File isolation on, Skip CLAUDE.md on, Memory to `project`, Permission mode to `acceptEdits`, Reasoning effort to `high`, and Max turns to 30, then saves
- **THEN** the file's frontmatter contains `isolation: 'worktree'`, `omitClaudeMd: 'true'`, `memory: 'project'`, `permissionMode: 'acceptEdits'`, `effort: 'high'`, and `maxTurns: '30'`

#### Scenario: Unexposed frontmatter keys survive a save

- **WHEN** an agent file's frontmatter contains `mcpServers`, `hooks`, or other keys the editor does not own, and the user edits and saves it in the editor
- **THEN** those keys are preserved verbatim in the saved file

#### Scenario: Delete a subagent

- **WHEN** the user deletes a subagent from the editor
- **THEN** the corresponding `~/.claude/agents/<name>.md` file is removed and the list no longer shows it

#### Scenario: Invalid frontmatter file

- **WHEN** a file in `~/.claude/agents/` has unparseable frontmatter
- **THEN** the list still shows the file (by filename) instead of failing the whole listing
