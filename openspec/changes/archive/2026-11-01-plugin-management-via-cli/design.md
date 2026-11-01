# Design

## Context

Clotho re-implements Claude Code plugin management on the CLI's own files (`src/main/claude/agent-config/plugins.ts`): parse `installed_plugins.json`, `git clone --depth 1` for marketplaces, `fs.cp` to install, Clotho-scoped `disabledPlugins` in `~/.clotho/settings.json` for enable state, and argv injection (`plugins: [{ type: 'local', path }]`) into SDK sessions.

Plugin operations are invoked as `execFile(claudeBinary, ['plugin', ...args], { timeout: 30000, maxBuffer: 10MB })` — `plugin list [--available] --json`, `plugin marketplace list/add/remove/update --json`, `plugin install/uninstall/enable/disable`. No file parsing, no git handling, no enable-state storage of Clotho's own.

CLI behavior verified on this machine (`@anthropic-ai/claude-agent-sdk@0.3.284`, CLI `claude plugin --help`):
- `plugin list --json` → array with `id`, `version`, `scope`, `enabled`, `installPath`, `notes`, `projectEnabled`.
- `plugin list --available --json` → `{ installed, available }`; `available` holds ~3900 catalog entries with `pluginId`, `name`, `description`, `marketplaceName`, `source` (incl. git-subdir ref/sha), `installCount`.
- `plugin marketplace list --json` → array with `name`, `source`, `repo`/`url`, `installLocation`.
- `plugin enable/disable` writes `enabledPlugins` in `~/.claude/settings.json` (`true`/`false`; missing = disabled).
- Mutating commands (`install`/`uninstall`/`enable`/`disable`) only affect newly started sessions — the CLI applies plugin changes at session start, so the UI surfaces a restart hint after each.
- The SDK's `settingSources` defaults to all filesystem sources, so Clotho sessions already load `~/.claude/settings.json`; the CLI mounts `enabledPlugins` itself. The current argv injection stacks on top of that.

## Goals / Non-Goals

**Goals:**
- One implementation of plugin logic: the CLI's, shared with every Claude Code surface.
- Gain what the hand-rolled version lacks: marketplace refresh, real install semantics (dependency resolution, version shas, install notes), full market catalog browsing.
- Enable state consistent across all Claude Code surfaces.

**Non-Goals:**
- Project-scoped (`--scope project/local`) plugin management in the UI; user scope only (CLI default auto-detect resolves to user for Clotho's context).
- Parsing or writing any file under `~/.claude/plugins/` — the CLI owns that directory.
- Bundling a fallback when the Claude Code binary is absent beyond surfacing the existing per-request error.

## Decisions

- **D1: CLI spawn layer.** `plugins.ts` becomes a thin wrapper that resolves the binary via the existing `resolveClaudeCodeBinary()` (already used for sessions; packaged builds point at the unpacked SDK binary) and `execFile`s `plugin` subcommands with a 30s timeout and 10MB maxBuffer. When the packaged binary is unavailable, fall back to `claude` on `PATH`. Alternative considered — waiting for the SDK to expose management APIs: rejected; none exist in 0.3.284 and the CLI surface is stable and already used for exactly this by other Claude Code clients.

- **D2: Enable state moves to the CLI's `enabledPlugins`.** Toggling runs `claude plugin enable/disable`. Clotho's `disabledPlugins` field is removed from `AgentCapabilityToggles` entirely — it never shipped, so no data migration is needed. Consequence, accepted by decision: enable state is now machine-wide, not per-app — toggling in Clotho affects every Claude Code session on the machine. Clotho never writes `~/.claude/settings.json` for plugins: `claude plugin enable/disable` does. Alternative — keeping Clotho-scoped state and filtering at injection: rejected; it is the divergence this change exists to remove.

- **D3: Drop argv injection; let the CLI mount plugins.** Session bootstrap no longer builds `plugins: [{ type: 'local', path }]` and no longer filters installed plugins by Clotho state (`claude-service.ts` `listInstalledPlugins` prefilter and `runner.ts` `normalizeOptions` plugin branch go away). `settingSources` remains at its default (all sources), so the CLI loads `enabledPlugins` from `~/.claude/settings.json` on every session start. Note: today the two mechanisms stack (an argv-injected plugin loads even if `enabledPlugins` says nothing); after the change only the CLI path remains, which is the behavior every Claude Code surface shares.

- **D4: RPC contract enriched in place, one new verb.** `agentListPlugins` returns the CLI's richer shape (`enabled`, `scope`, `notes`); marketplace listing gains catalog browsing via `includeAvailable` on the existing list call (matching the CLI's flag) plus a new `agentRefreshMarketplace` RPC; install keeps `agentInstallPlugin { marketplace, plugin }` and serializes to `plugin install <plugin>@<marketplace>`. Renderer reads `enabled` straight from the response — no Clotho-side toggle store. Reuses the existing `list_marketplaces`/`install` request names so renderer changes stay contained to the plugin settings component.

- **D5: Restart semantics surfaced, not faked.** After any mutating operation the UI shows a localized "applies to new sessions" hint. No attempt to hot-reload running sessions (`Query.reloadPlugins()` exists but re-loading mid-session diverges from CLI semantics and risks inconsistent tool state).

## Risks / Trade-offs

- **CLI output drift.** `plugin list --json` shapes are CLI-internal and can change between versions; Clotho pins the CLI via the SDK's bundled binary, so drift arrives only with SDK upgrades — the same coupling any CLI-spawning client accepts. Mitigation: parse defensively (unknown fields ignored, `notes` optional).
- **First-call latency.** `plugin list --available --json` walks ~3900 catalog entries and took seconds locally; the plugins page loads installed-only by default and fetches the catalog for the browse view, so the slow path is opt-in.
- **Mutating commands may prompt.** `plugin install` can ask to accept a marketplace-declared command (sha-confirmed); non-interactive spawn cannot answer. Mitigation: detect the prompt in stderr/stdout, fail with that message, and let the user run the install in a terminal — rare edge.
