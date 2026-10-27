# Proposal

## Why

The settings Subagents page lists only file-based subagents from `~/.claude/agents/*.md`, so on a fresh machine it shows "Nothing here yet" even though Claude sessions can already invoke built-in subagents (`general-purpose`, `Explore`, `Plan`, `claude`, `claude-code-guide`, `statusline-setup`) and plugin-provided subagents. The page hides capabilities that are real and in use, and there is no way to discover them.

## What Changes

- Add a main-process service that calls the Agent SDK `Query.supportedAgents()` (spawn a short-lived empty `query()`, read the agent list, close the query) and caches the result in the main process.
- Add a new RPC `agentListAvailableSubagents` returning the full resolved subagent set (built-in + plugin + custom), reusing `AgentSubagentConfig` extended with `builtin?: boolean` and `source?: 'builtin' | 'plugin' | 'custom'`.
- Classify each agent by source in the main process: names matching a stem of `~/.claude/agents/*.md` are custom agents; else names containing `:` are plugin agents; the rest are built-in.
- Rework the settings Subagents list to render the available-subagent set as three stacked cards (Built-in, Plugin, Custom) inside one shared scroll container, under the section heading row that shows an `Installed N items` summary with the Add button at its right end; each card opens with a subtle text-only source label, with generous spacing between cards; each row carries a source icon badge; built-in and plugin agents are shown read-only with no edit/delete actions; custom agents keep the existing create/edit/delete editor flow.
- The existing `agentListSubagents` / `agentSaveSubagent` / `agentDeleteSubagent` RPCs and their file CRUD behavior are unchanged; the available list is additive.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-capability-settings`: The "Subagent management" requirement changes — the list must present the full available subagent set (built-in, plugin, custom) resolved via the Agent SDK, with built-in and plugin agents read-only (badged, non-deletable), while custom subagent CRUD remains as before.

## Impact

- `src/shared/rpc.ts`: `AgentSubagentConfig` gains `builtin?`/`source?`; new `agentListAvailableSubagents` RPC.
- `src/main/`: new supported-agents service (SDK `query()` + `supportedAgents()` + cache); new IPC handler in `bootstrap.ts` / `claude-service.ts`.
- `src/preload/index.ts`, `src/renderer/services/claude/agent-config.ts`: bridge + renderer service additions.
- `src/renderer/pages/settings/components/agent-subagent-settings.tsx`: list rendering, badges, read-only rows; i18n catalogs (three languages) for badge labels.
- Cost note: each refresh spawns one short-lived Claude session process (seconds); mitigated by main-process caching and manual refresh only.
