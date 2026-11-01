# Proposal

## Why

Clotho's plugin management re-implements Claude Code's plugin logic by hand: it parses `installed_plugins.json`, runs `git clone` for marketplaces, copies plugin directories to install, and tracks enable state in Clotho's own `disabledPlugins`. This is thinner and drifting from the CLI: no marketplace refresh, no real install semantics (dependency resolution, version shas, install warnings), no market catalog browsing, and an enable state that disagrees with what the CLI shows. The CLI already ships a stable `claude plugin ...` subcommand surface covering all of this. Clotho should invoke it instead of reimplementing it.

## What Changes

- Rewrite the main-process plugin module (`src/main/claude/agent-config/plugins.ts`) as a CLI invocation layer: every plugin operation becomes a spawn of the resolved Claude Code binary's `plugin` subcommand, instead of direct file/JSON manipulation.
  - List installed plugins via `claude plugin list --json` (gains `enabled`, `scope`, `mcpServers`, `notes` fields).
  - Browse marketplaces via `claude plugin marketplace list --json` and `claude plugin list --available --json` (gains the full market catalog: ~3900 entries with descriptions and install counts).
  - Install via `claude plugin install <plugin@marketplace>`; uninstall via `claude plugin uninstall`; both replace the hand-rolled copy/remove logic.
  - Add marketplace via `claude plugin marketplace add <source>`; remove via `marketplace remove`; NEW: refresh via `marketplace update` (closes the stale-listing gap).
- Switch enable/disable to the CLI's own state: `claude plugin enable/disable <id>`, which writes `enabledPlugins` in `~/.claude/settings.json`. **BREAKING**: Clotho no longer keeps a per-app `disabledPlugins` list in `~/.clotho/settings.json`; plugin enable state becomes shared with all Claude Code surfaces (terminal CLI, Clotho). Clotho has not shipped with the old field, so it is simply removed.
- Stop injecting plugins into SDK sessions via `plugins: [{ type: 'local', path }]` argv: sessions already load all filesystem settings (default `settingSources`), so the CLI mounts enabled plugins itself. Remove the Clotho-side filtering in the session bootstrap.
- Surface `needsRestart` semantics in the UI: plugin changes take effect for new sessions, running sessions are unaffected.

## Capabilities

### New Capabilities

(none — plugin management already exists as a capability; this change modifies its requirements)

### Modified Capabilities

- `agent-capability-settings`: The Plugin management requirement changes from direct-file manipulation with Clotho-scoped enable state to CLI-command invocation with the CLI's shared enable state; adds marketplace refresh and market catalog browsing; the "does not alter the CLI's own enable state" guarantee is inverted by design.

## Impact

- `src/main/claude/agent-config/plugins.ts` — full rewrite to CLI-spawn layer; the RPC handlers in `src/main/claude-service.ts` keep their shape but return the enriched plugin/marketplace shapes.
- `src/shared/rpc.ts` — `AgentPluginInfo` gains `enabled`, `scope`, `notes`; `AgentMarketplaceInfo` gains plugin/installed counts; new `agentRefreshMarketplace` RPC; `agentInstallPlugin` gains scope semantics.
- `src/main/claude/runner.ts` + `src/main/claude-service.ts` — remove `enabledPlugins` path-injection and Clotho-side filtering from session bootstrap.
- `src/main/claude/settings.ts` — drop `disabledPlugins` from `AgentCapabilityToggles` (never shipped, so no migration).
- Renderer `src/renderer/pages/settings/components/agent-plugin-settings.tsx` — toggle now means CLI enable; add refresh action per marketplace; restart hint after install/uninstall/toggle.
- Binary resolution reuses `resolveClaudeCodeBinary()` (`src/main/claude/sdk-binary.ts`) — the same binary Clotho sessions already spawn.
