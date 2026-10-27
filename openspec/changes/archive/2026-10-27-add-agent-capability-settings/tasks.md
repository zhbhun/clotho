# Tasks

## 1. Shared file-safety helpers and settings store

- [x] 1.1 Create `src/main/claude/agent-config/fs-safe.ts` with `readJsonFile` (parse-error typed result, no silent defaults) and `writeJsonAtomic` (fresh read → merge via caller callback → temp file + rename + chmod 0o600), modeled on `writeSettings` in `src/main/claude/settings.ts`. Verify: unit tests cover merge-preserves-unrelated-fields, parse-failure error, and temp-file cleanup (`fs-safe.test.ts`).
- [x] 1.2 Add optional `agentCapabilities` (disabled plugins map, disabled skills list) to `ClaudeskSettings` with a sanitizer in `sanitizeAppPreferences` defaults, so old `settings.json` files load unchanged. Verify: `settings.test.ts` round-trips a file without the field and with it.

## 2. Main-process domain modules

- [x] 2.1 `subagents.ts`: list/create/update/delete `~/.claude/agents/*.md` with a minimal flat-frontmatter parser that preserves the raw frontmatter block on write. Verify: unit tests for round-trip, unparseable-frontmatter listing-by-filename, and delete (`subagents.test.ts`).
- [x] 2.2 `mcp-servers.ts`: list/save/delete entries of `mcpServers` in `~/.claude.json` through `writeJsonAtomic` (fresh read at save, unrelated fields preserved); support stdio/http/sse entry shapes. Verify: unit tests for stdio + http round-trip, concurrent-modification merge, and parse-error propagation (`mcp-servers.test.ts`).
- [x] 2.3 `hooks.ts`: read/modify/write the `hooks` field of `~/.claude/settings.json` in CLI file format (event → `[{matcher, hooks:[{type:'command',command}]}]`), command-type only, preserving all other settings fields. Verify: unit tests for list/create/delete including removing an emptied event (`hooks.test.ts`).
- [x] 2.4 `skills.ts`: scan `~/.claude/skills/*/SKILL.md` (skip dirs without SKILL.md), read name/description from frontmatter, delete directory, and Clotho-scoped enable/disable via `agentCapabilities`. Verify: unit tests for scan-without-SKILL.md, frontmatter read, delete (`skills.test.ts`).
- [x] 2.5 `plugins.ts`: list entries from `installed_plugins.json`, install-from-marketplace (copy from checkout into cache + append v2-shaped entry), remove; marketplace add (`git clone --depth 1` into `marketplaces/<name>` + `known_marketplaces.json`) and remove; Clotho-scoped enable state via `agentCapabilities`. Verify: unit tests with temp plugin dirs and a fake git stub for clone (`plugins.test.ts`).
- [x] 2.6 `workflows.ts`: list/create/read/update/rename/delete files under `~/.claude/workflows/`. Verify: unit tests for CRUD and rename collision error (`workflows.test.ts`).

## 3. RPC contract and service wiring

- [x] 3.1 Add request types to `src/shared/rpc.ts`: per domain `claudeList<X>` / `claudeSave<X>` / `claudeDelete<X>`, plus `claudeSet<X>Enabled` for mcp/plugins/skills; payload types for each entity. Verify: `npm run check` passes.
- [x] 3.2 Add delegating methods to `ClaudeService` (`src/main/claude-service.ts`) and register handlers in `bootstrap.ts` `requestHandlers`, following the `claudeListProviders` pattern. Verify: `npm run check` passes; unit test asserts service methods delegate with expected args (`claude-service.test.ts`).
- [x] 3.3 Enforce Clotho-scoped enable state at session spawn: `normalizeOptions` in `runner.ts` filters `skills` by disabled list and passes enabled plugins as `plugins: [{type:'local', path}]`. Verify: unit tests in `runner.test.ts` cover both disabled-omitted and enabled-included cases.

## 4. Renderer: settings page and category components

- [x] 4.1 Convert `CATEGORIES` in `settings/index.tsx` to grouped `CATEGORY_GROUPS` (基础设置 + Agent 能力), keeping flattened arrow-key navigation order and roving tabindex behavior. Verify: existing `index.test.tsx` still passes; add a test that the six new categories render under the group label.
- [x] 4.2 Add i18n rows to `src/renderer/i18n/catalogs/settings.ts` for group label, six category names, and all editor copy (en/zh-CN/zh-TW). Verify: `npm run check` passes; spot-check zh-CN strings in a component test.
- [x] 4.3 Subagents component: list with name/description/model, create/edit editor (frontmatter fields + system prompt textarea), delete with confirm. Verify: component test covers list render, save calls RPC, delete calls RPC.
- [x] 4.4 MCP servers component: list with type badge and connection summary, stdio/http/sse editor (command/args/env or url/headers), enable toggle, delete. Verify: component test covers type switch and toggle RPC.
- [x] 4.5 Hooks component: event list grouped by event, editor with matcher + command rows, delete. Verify: component test covers adding a command row and save payload shape.
- [x] 4.6 Skills component: list with name/description, enable toggle, delete with confirm. Verify: component test covers toggle and delete RPC.
- [x] 4.7 Plugins component: installed list with marketplace/version, enable toggle, remove; marketplace manager (add by git URL, remove); install button per marketplace plugin. Verify: component test covers toggle, add-marketplace RPC, install RPC.
- [x] 4.8 Workflows component: file list with last-modified, text editor, rename, delete. Verify: component test covers edit-save and rename RPC.
- [x] 4.9 Wire the six components into `settings/index.tsx` category switch. Verify: `npm run check` and `npm run lint` pass on changed files.

## 5. Integration verification

- [x] 5.1 `npm run check`, `npm run lint` (changed files), and the touched module test suites pass. Verify: commands exit clean.
- [x] 5.2 Manual verification via `npm run debug` over CDP: create + edit + delete one subagent, one MCP server, one hook against the real `~/.claude` files; confirm `~/.claude.json` unrelated fields survive an MCP save and a concurrently running `claude` CLI process still starts. Verify: observable file states before/after; stop the app if started.
