# agent-capability-settings Specification

## Purpose

The settings page shall let the user view and manage the user-level Claude Code capability configuration that Clotho sessions already load at runtime: subagents, plugins, MCP servers, skills, hooks, and workflows under `~/.claude`. All management is user-level; project-level configuration is out of scope.

## Requirements

### Requirement: Settings sidebar groups categories

The settings page SHALL organize its categories into named groups, with the six agent-capability categories (subagents, plugins, MCP servers, skills, hooks, workflows) presented under a distinct group separate from the existing base settings categories. Selecting a category SHALL show its management view in the content pane.

#### Scenario: Agent capability group visible

- **WHEN** the user opens the settings page
- **THEN** the sidebar shows the six agent-capability categories grouped under an "Agent 能力" label, separate from the existing base categories

#### Scenario: Category selection switches content

- **WHEN** the user selects a category in the Agent capability group
- **THEN** the content pane shows that category's management view and the header shows the category name

### Requirement: Subagent management

The system SHALL list user-level subagents defined in `~/.claude/agents/*.md`, and let the user create, edit, and delete them. The editor SHALL expose the standard subagent frontmatter fields (name, description, tools, model) and the system prompt body. Deleting SHALL remove the markdown file.

#### Scenario: List subagents

- **WHEN** the user opens the subagents category
- **THEN** the system lists every `*.md` file in `~/.claude/agents/` with its name, description, and model, sourced from the file's frontmatter

#### Scenario: Create a subagent

- **WHEN** the user submits a new subagent with a name, description, optional tools/model, and a system prompt
- **THEN** the system writes `~/.claude/agents/<name>.md` with frontmatter and body, and the list shows the new subagent

#### Scenario: Delete a subagent

- **WHEN** the user deletes a subagent
- **THEN** the corresponding `~/.claude/agents/<name>.md` file is removed and the list no longer shows it

#### Scenario: Invalid frontmatter file

- **WHEN** a file in `~/.claude/agents/` has unparseable frontmatter
- **THEN** the list still shows the file (by filename) instead of failing the whole listing

### Requirement: MCP server management

The system SHALL list user-scoped MCP servers from the `mcpServers` field of `~/.claude.json`, and let the user create, edit, delete, enable, and disable them for Clotho sessions. The editor SHALL support the server types Claude Code supports for user scope (stdio with command/args/env; http and sse with url/headers). Writes SHALL re-read `~/.claude.json` immediately before writing and replace the file atomically, because concurrently running CLI processes rewrite that file; the write SHALL preserve every unrelated field it read.

#### Scenario: List MCP servers

- **WHEN** the user opens the MCP category
- **THEN** the system lists each entry of `mcpServers` in `~/.claude.json` with its name, type, and connection summary (command for stdio, url for http/sse)

#### Scenario: Create a stdio MCP server

- **WHEN** the user submits a new server of type stdio with a command and optional args/env
- **THEN** the system re-reads `~/.claude.json`, adds the entry to its `mcpServers`, and atomically replaces the file

#### Scenario: Disable an MCP server for Clotho sessions

- **WHEN** the user disables an MCP server
- **THEN** the server's entry stays in `~/.claude.json` (the CLI's own state is untouched), and Clotho sessions stop loading that server

#### Scenario: Concurrent CLI write is not clobbered

- **WHEN** the system saves an MCP change while a CLI process has concurrently rewritten `~/.claude.json`
- **THEN** the system writes on top of a fresh re-read taken at save time, so the CLI's concurrent changes to other fields survive

### Requirement: Hook management

The system SHALL list command-type hooks from the `hooks` field of `~/.claude/settings.json`, and let the user create, edit, and delete them. The editor SHALL offer the Claude Code hook events and, per event, CLI file format entries: an optional matcher and one or more commands. The system SHALL NOT invent non-command hook types.

#### Scenario: List hooks

- **WHEN** the user opens the hooks category
- **THEN** the system lists each event configured in `hooks` in `~/.claude/settings.json` with its matchers and commands

#### Scenario: Create a hook

- **WHEN** the user submits a hook for an event with an optional matcher and one or more command strings
- **THEN** the system writes a command-type hook entry in the CLI file format into `~/.claude/settings.json`, preserving all other settings fields

#### Scenario: Delete a hook

- **WHEN** the user deletes the last hook under an event
- **THEN** the event's entry is removed from `hooks` and all other settings fields are preserved

### Requirement: Skill management

The system SHALL list user-level skills by scanning `~/.claude/skills/` for directories containing `SKILL.md`, reading each skill's name and description from its frontmatter, and let the user delete a skill directory. The system SHALL let the user enable or disable a skill for Clotho sessions without deleting it.

#### Scenario: List skills

- **WHEN** the user opens the skills category
- **THEN** the system lists each `~/.claude/skills/<name>/SKILL.md` with its name and description

#### Scenario: Delete a skill

- **WHEN** the user deletes a skill
- **THEN** the skill's directory under `~/.claude/skills/` is removed and the list no longer shows it

#### Scenario: Directory without SKILL.md

- **WHEN** a directory under `~/.claude/skills/` contains no `SKILL.md`
- **THEN** it is not listed as a skill and the listing does not fail

### Requirement: Plugin management

The system SHALL list installed plugins from `~/.claude/plugins/installed_plugins.json` (name, marketplace, version, install path), let the user enable or disable a plugin for Clotho sessions, and let the user remove an installed plugin. The system SHALL let the user add a plugin marketplace by git URL (cloned under `~/.claude/plugins/marketplaces/` and recorded in `known_marketplaces.json`) and remove a marketplace, and install a plugin from an added marketplace by copying from the marketplace checkout. Plugin enable state SHALL be tracked so that it does not alter the CLI's own enable state.

#### Scenario: List installed plugins

- **WHEN** the user opens the plugins category
- **THEN** the system lists each entry in `~/.claude/plugins/installed_plugins.json` with name, marketplace, and version

#### Scenario: Enable or disable a plugin for Clotho sessions

- **WHEN** the user toggles a plugin
- **THEN** the toggle is recorded in Clotho's own state and Clotho sessions start (or stop) loading the plugin, while `~/.claude/settings.json`'s CLI enable state is left untouched

#### Scenario: Add and remove a marketplace

- **WHEN** the user adds a marketplace by git URL, or removes one
- **THEN** the marketplace is cloned and recorded (or unrecorded and its checkout deleted) under `~/.claude/plugins/`

#### Scenario: Install a plugin from a marketplace

- **WHEN** the user installs a plugin from a marketplace
- **THEN** the plugin's directory is copied from the marketplace checkout into the installed plugins cache and recorded in `installed_plugins.json`

### Requirement: Workflow management

The system SHALL list user-level workflow files under `~/.claude/workflows/`, and let the user create, edit (as text), rename, and delete them. Workflows need no configuration injection; management is file CRUD.

#### Scenario: List workflows

- **WHEN** the user opens the workflows category
- **THEN** the system lists the workflow files in `~/.claude/workflows/` with name and last-modified time

#### Scenario: Edit a workflow

- **WHEN** the user saves an edited workflow
- **THEN** the file content under `~/.claude/workflows/` is replaced and the list reflects the change

#### Scenario: Delete a workflow

- **WHEN** the user deletes a workflow
- **THEN** the file is removed from `~/.claude/workflows/`

### Requirement: Main-process file safety for shared config files

All main-process writes to `~/.claude/settings.json` and `~/.claude.json` SHALL be read-modify-write with an immediate pre-write re-read and an atomic file replacement (temp file + rename), preserving unrelated fields, so that edits coexist with concurrently running Claude Code CLI processes. Read failures SHALL be surfaced to the renderer as per-request errors, and JSON parse failures of a managed file SHALL be reported instead of silently overwriting the file.

#### Scenario: Atomic replace on save

- **WHEN** any agent-capability operation writes `~/.claude/settings.json` or `~/.claude.json`
- **THEN** the write goes through a temp file renamed over the target, never a partial in-place rewrite

#### Scenario: Corrupt managed file reported

- **WHEN** a managed file exists but fails JSON parsing during a read or write operation
- **THEN** the operation reports a parse error to the renderer instead of overwriting the file
