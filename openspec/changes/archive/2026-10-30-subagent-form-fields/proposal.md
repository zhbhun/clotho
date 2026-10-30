# Proposal

## Why

The subagent editor only exposes 4 frontmatter fields (name, description, tools, model), while Claude Code supports many more subagent frontmatter fields (disallowedTools, permissionMode, effort, maxTurns, skills, background, omitClaudeMd, memory, isolation, color). Users must hand-edit `~/.claude/agents/*.md` to use them. The list row also always shows a model label even when no model is configured, and offers no affordance to open the editor.

## What Changes

- Extend the subagent editor with the remaining user-facing frontmatter fields, grouped in an "Advanced options" collapsible section:
  - model: select (default / sonnet / opus / haiku / inherit) instead of free text
  - tools: mode select (all tools / custom) plus a checkbox grid of common tools when custom
  - disallowedTools, skills: comma-separated text inputs
  - permissionMode, effort, memory, color: selects with lowercase enum values
  - maxTurns: number input
  - background, omitClaudeMd: switches
  - isolation: switch (on = `worktree`)
- Editor layout: Name on its own row (hint moved into placeholder), Description as a single-line textarea (Enter and pasted newlines stripped), advanced collapsible between identity fields and the system prompt body.
- List row changes: chevron affordance opens the editor (custom subagents only); the model label shows only when a non-default model is configured; the delete action moves from the row into the editor footer.
- Delete action now lives in the editor footer (danger button, left side), not on the list row.
- The frontmatter parser/serializer in the main process handles the new fields while preserving unknown keys verbatim on write (existing round-trip behavior).
- UI copy is English-first; localization catalogs gain keys for the new fields (other locales fall back to English until translated).
- Fields not exposed in the UI (mcpServers, hooks, experimental, initialPrompt, autoCompactWindow) are preserved verbatim on save.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-capability-settings`: The Subagent management requirement changes — the editor exposes the extended frontmatter fields in an advanced section, the list row shows a chevron to open the editor and the model label only for non-default models, and delete moves into the editor footer.

## Impact

- `src/shared/rpc.ts` — `AgentSubagentConfig` gains the new optional fields.
- `src/main/claude/agent-config/subagents.ts` — frontmatter parse/serialize for the new fields (string lists, number, booleans, enum strings) with unknown-key preservation.
- `src/main/claude/agent-config/supported-agents.ts` — `AvailableSubagent` mapping carries the new fields.
- `src/main/claude-service.ts` — `listAgentSubagents` / `saveAgentSubagent` pass-through of the new fields.
- `src/renderer/pages/settings/components/agent-subagent-settings.tsx` — editor layout, advanced collapsible, tools grid, switches/selects; row changes; editor footer delete.
- `src/renderer/i18n/catalogs/settings.ts` — new keys (English source copy).
- Tests: `subagents.test.ts` (round-trip), `agent-subagent-settings.test.tsx` (editor interactions).

Prototype: `prototype.html` in this change directory (variant A adopted).
