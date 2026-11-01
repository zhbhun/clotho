# Tasks

## 1. Main-process CLI layer

- [x] 1.1 Rewrite `src/main/claude/agent-config/plugins.ts` as a CLI spawn layer: resolve the binary via `resolveClaudeCodeBinary()` with `PATH` fallback, `execFile` with 30s timeout / 10MB maxBuffer, JSON parse of stdout, non-zero exit surfaces stderr as an error
- [x] 1.2 Implement list operations: `plugin list --json` (installed, with `enabled`/`scope`/`notes`), `plugin list --available --json` (catalog), `plugin marketplace list --json`
- [x] 1.3 Implement mutating operations: `plugin install <plugin>@<marketplace>`, `plugin uninstall <id>`, `plugin enable/disable <id>`, `plugin marketplace add/remove <source>`, `plugin marketplace update [name]`
- [x] 1.4 Update/replace `plugins.test.ts` to cover the spawn layer with a mocked `execFile`: command/flag construction, JSON parsing, error propagation, binary-resolution fallback

## 2. RPC contract and wiring

- [x] 2.1 Update `src/shared/rpc.ts`: enrich `AgentPluginInfo` (`enabled`, `scope`, `notes`), add catalog types for available plugins, add `agentRefreshMarketplace`, keep existing request names; `npm run check` passes
- [x] 2.2 Rewire handlers in `src/main/claude-service.ts` to the new module; remove the `disabledPlugins` prefilter from `listInstalledPlugins` usage in session bootstrap
- [x] 2.3 Update `claude-service.test.ts` for the new handler shapes

## 3. Enable-state cleanup

- [x] 3.1 Remove `disabledPlugins` from `AgentCapabilityToggles` in `src/main/claude/settings.ts` and its sanitizer (never shipped, so no migration code)

## 4. Session injection removal

- [x] 4.1 Remove the `enabledPlugins` path-injection branch from `normalizeOptions` in `src/main/claude/runner.ts` and the `AgentCapabilityFilters` plugin field
- [x] 4.2 Update `runner.test.ts` to assert plugins are no longer injected via argv

## 5. Renderer

- [x] 5.1 Update `agent-plugin-settings.tsx`: read `enabled` from the list response for the toggle (calling enable/disable), show `scope` and `notes` on rows, add per-marketplace refresh action, add catalog browse view (name, description, marketplace, install count, install action)
- [x] 5.2 Show the localized "applies to new sessions" restart hint after install/uninstall/enable/disable; add zh-CN/zh-TW strings to `src/renderer/i18n/catalogs/settings.ts`
- [x] 5.3 Update `agent-plugin-settings.test.tsx` for toggle-writes-CLI-state, refresh, catalog browse, and restart-hint behavior

## 6. Verification

- [x] 6.1 `npm run check`, lint and format on changed files, targeted tests for all touched modules
- [x] 6.2 Manual pass via `npm run debug` (CDP 3367): list shows installed plugins with CLI-matching enabled states; toggle a plugin and confirm `~/.claude/settings.json` `enabledPlugins` updates and `claude plugin list --json` agrees; refresh a marketplace and confirm the checkout updates; install/uninstall round-trip
