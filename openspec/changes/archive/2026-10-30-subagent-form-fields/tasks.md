# Tasks

## 1. Shared contract

- [x] 1.1 Extend `AgentSubagentConfig` in `src/shared/rpc.ts` with optional `disallowedTools`, `permissionMode`, `effort`, `maxTurns`, `background`, `omitClaudeMd`, `memory`, `isolation`, `skills`, `color`; run `npm run check`.

## 2. Main-process frontmatter

- [x] 2.1 Extend `SubagentFrontmatter` and parse/serialize in `src/main/claude/agent-config/subagents.ts` for the new fields: comma-separated lists (`disallowedTools`, `skills`), number-as-string (`maxTurns`), booleans (`background`, `omitClaudeMd`), enums (`permissionMode`, `effort`, `memory`, `isolation`, `color`); grow the owned-key set and keep unknown lines verbatim. Verify in `subagents.test.ts`: round-trip preserves unowned keys, boolean/number serialize as quoted strings, `tools` key omitted when mode is all tools.
- [x] 2.2 Update `claude-service.ts` `listAgentSubagents`/`saveAgentSubagent` and `supported-agents.ts` `customSubagentFrom` to carry the new fields through; extend `supported-agents.test.ts` for the mapping.

## 3. Editor UI

- [x] 3.1 Split the editor into `subagent-editor.tsx` next to `agent-subagent-settings.tsx`: Name row with rules-in-placeholder, single-line Description textarea (Enter/pasted newlines stripped), Advanced options collapsible (initial open state = any advanced field set, header shows set-count), system prompt textarea, footer with Delete/Cancel/Save. Verify with `agent-subagent-settings.test.tsx`: renders, description strips newlines, collapsible count matches set fields.
- [x] 3.2 Build the advanced fields: selects for model/permissionMode/effort/memory/color (lowercase values per prototype), number input for maxTurns (empty/NaN → undefined on save), switches for background/omitClaudeMd/isolation, comma inputs for disallowedTools/skills; tools mode select + checkbox grid with non-grid `tools` entries preserved on save. Verify in tests: mode `all tools` clears the `tools` key, `custom` writes checked names plus pass-through entries, model select shows a hand-written unknown model ID as an option.
- [x] 3.3 Rewire list rows: Claude-mark badge for built-in, `Puzzle` for plugin, `User` for custom; model label only when a model is set; chevron opens the editor; row delete button removed; editor footer Delete reuses the existing confirm dialog. Verify in `agent-subagent-settings.test.tsx`.

## 4. Copy and final verification

- [x] 4.1 Add English-source i18n keys to `src/renderer/i18n/catalogs/settings.ts` for the new labels, hints, placeholders, enum option labels, and advanced-section copy; reuse `settings.agent.*` shared keys where they already exist. Verify the page renders in en/zh-CN/zh-TW without missing-key warnings (zh fall back to English).
- [x] 4.2 Run `npm run check`, module ESLint/Prettier on changed files, and the affected module tests (`subagents.test.ts`, `supported-agents.test.ts`, `agent-subagent-settings.test.tsx`); spot-check the flow against `prototype.html` in this change directory.
