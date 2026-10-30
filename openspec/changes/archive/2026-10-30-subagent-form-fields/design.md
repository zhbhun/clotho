# Design

## Context

The subagent editor (`AgentSubagentSettings` in `src/renderer/pages/settings/components/agent-subagent-settings.tsx`) today edits four frontmatter keys. The main-process parser (`src/main/claude/agent-config/subagents.ts`) understands flat single-line `key: value` frontmatter only, keeps unknown lines verbatim in `raw`, and re-writes only the owned keys (`name`, `description`, `tools`, `model`). The SDK's `supportedAgents()` returns only name/description/model, so extended fields are visible only for custom (file-backed) subagents. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Expose the remaining user-facing frontmatter fields in the editor, grouped in an advanced collapsible section (prototype variant A adopted).
- Keep the round-trip guarantee: unknown/unexposed frontmatter keys survive every save.
- Keep built-in/plugin entries read-only; extended fields are editable on custom subagents only.

**Non-Goals:**

- No UI for `mcpServers`, `hooks`, `experimental`, `initialPrompt`, `autoCompactWindow` (preserved verbatim instead).
- No multi-line YAML list syntax; list fields serialize as single-line comma-separated values.
- No localization of the new copy beyond the English source strings (catalog falls back to English for other locales).
- No change to resolution, caching, or refresh behavior of the available-subagent list.

## Decisions

- **D1: Extended fields as strings over the existing flat parser.** The frontmatter file format is single-line `key: value` with quoted strings (existing `quote`/`unquote`). New list fields (`disallowedTools`, `skills`, and `tools` beyond the existing comma string) store comma-separated values in one line; numbers (`maxTurns`) and booleans (`background`, `omitClaudeMd`) store their string forms (`'30'`, `'true'`). The `SubagentFrontmatter` interface and the owned-key set grow accordingly. Alternative: a real YAML library — rejected; it would reformat unknown keys and break the verbatim-preservation design (D5 of the original change).

- **D2: Tools mode is UI state, not a field.** `all tools` means the `tools` key is absent (delete it from owned output when mode is all); `custom` writes the checked grid names. Grid tools not present in the file plus extra entries already in `tools` (e.g. `mcp__github__*`) are preserved: on save, grid checkbox state applies to the nine grid names only, and any other tokens in the existing `tools` value pass through. The renderer derives the initial mode from whether `tools` is set.

- **D3: `model` becomes a select with `default` meaning "no key".** `default` and empty both clear the field. Values `sonnet`/`opus`/`haiku`/`inherit` map to the literal strings. A previously hand-written custom model ID not in the list: the select shows its raw value as an extra option so it round-trips instead of being silently cleared.

- **D4: Editor layout per adopted prototype.** Name row (rules moved into placeholder), single-line description textarea (strip `\n` on input), advanced collapsible (expanded initial state = any advanced field set; header shows set-count), system prompt textarea, footer with Delete (left, danger) and Cancel/Save (right). The existing grid rows and `AgentEmpty`/`DeleteButton` shared components are reused where they fit; the advanced section and tools grid become separate components in the same file's folder to respect the ~300-line boundary (`subagent-editor.tsx` alongside `agent-subagent-settings.tsx`).

- **D5: Row changes are renderer-only.** Model label renders only when `model` is set and not empty; the chevron replaces the Edit button for custom rows; `DeleteButton` moves out of the row into the editor footer (reusing the existing confirmation dialog semantics). `AgentSubagentConfig` in `src/shared/rpc.ts` gains optional fields (`disallowedTools`, `permissionMode`, `effort`, `maxTurns`, `background`, `omitClaudeMd`, `memory`, `isolation`, `skills`, `color`); the main-process list/save handlers pass them through unchanged in shape.

- **D6: Icons.** Built-in rows render a Claude star mark, plugin rows the Lucide `Puzzle`, custom rows the Lucide `User`, replacing the current `Sparkles`/`Puzzle`/`User` trio mapping (only built-in changes in practice).

- **D7: English-first copy.** New i18n keys are added to `settings.ts` with `setting(en, zhCN, zhTW = zhCN)`; zh-CN/zh-TW translations follow once the English copy is confirmed. Enum values (`inherit`, `none`, model IDs, permission modes) stay verbatim lowercase literals in every locale because they are written to the file; UI-only labels (e.g. the tools mode options) are translated.

## Risks / Trade-offs

- [Comma-joined lists break if a skill name contains a comma] → Skill and tool names are code identifiers without commas in practice; the hint shows the format. No escaping layer.
- [The nine-tool grid cannot express every tool] → Non-grid tools already in the file pass through on save (D2); users who need exotic allowlists keep hand-editing, and those entries survive.
- [Flat parser treats `key: value with: colon` values naively] → Existing `indexOf(':')` split takes the first colon only; values containing colons (URLs in a future field) still work since only the first separator splits.
- [Renderer number input can emit empty/garbage] → Save maps empty/NaN `maxTurns` to undefined, omitting the key.

## Migration Plan

Pure renderer + main-process field extension; files on disk keep working unchanged (new keys are additive, unknown keys preserved). No data migration. Rollback = revert the commit.

## Open Questions

(none)
