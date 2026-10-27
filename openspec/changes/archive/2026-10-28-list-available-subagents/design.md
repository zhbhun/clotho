# Design

## Context

The settings page currently resolves subagents by scanning `~/.claude/agents/*.md` (`main/claude/agent-config/subagents.ts`). The Agent SDK exposes the full resolved set — built-in plus plugin plus file-based — only via `Query.supportedAgents()` on a live query (`sdk.d.ts:3005`, `AgentInfo = { name, description, model? }`). A probe run against the local SDK returned 6 built-in agents (`general-purpose`, `Explore`, `Plan`, `claude`, `claude-code-guide`, `statusline-setup`) plus 4 plugin agents. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One main-process API that returns the complete available-subagent set with a per-agent source classification.
- Settings page renders the set in three stacked source cards (Built-in / Plugin / Custom), with a source icon badge per row; built-in/plugin rows are read-only; custom rows keep the existing CRUD flow.
- Resolve when the page opens, cache in the main process; no refresh control, no polling.

**Non-Goals:**
- Managing plugin or built-in agents (enable/disable/delete) — they are display-only here.
- Project-level `.claude/agents/` management (separate gap, not this change).
- Auto-refresh/polling of the agent set.

## Decisions

- **D1: Resolve via a short-lived SDK query, not hardcoding.** `supportedAgents()` always reflects the real resolved set (built-ins change, plugins install/remove). Hardcoding the three core names would go stale and miss `claude`, `claude-code-guide`, `statusline-setup`. Alternative rejected: static list (stale, incomplete).
- **D2: Cache one snapshot in the main process.** The first `agentListAvailableSubagents` call spawns an empty `query()`, awaits `supportedAgents()`, closes the query, and stores the result; later calls reuse the snapshot while the app runs. No refresh RPC and no manual refresh control: the snapshot lives for the app session, and restarting the app (or reinstalling a plugin, which surfaces next launch) is the refresh path. Alternative rejected: an explicit refresh control — rejected by product decision as clutter for a rarely-changing set.
- **D3: Classify by name with custom-first precedence, since `AgentInfo` has no source field.** Name matches a stem of an existing `~/.claude/agents/*.md` file → custom; else name contains `:` → plugin; otherwise → builtin. The file scan already exists (`listSubagentConfigs`) and is reused for both the match and the editor's file CRUD. Custom wins over the other two because a user-defined file shadows same-named built-ins/plugins in Claude Code's own precedence, and the row must then show as editable. Alternative rejected: heuristics on description text.
- **D4: New additive RPC `agentListAvailableSubagents`.** Returns `AgentSubagentConfig[]` extended with `builtin?: boolean` and `source?: 'builtin' | 'plugin' | 'custom'`; custom rows carry `tools`/`body`/`file` for the editor. Existing `agentListSubagents`/save/delete RPCs stay untouched so editor CRUD and its tests are unaffected.
- **D5: Failure fallback to the file scan.** If the SDK query fails, the RPC returns file-based entries from `listSubagentConfigs` (matching today's page) plus the load-error signal, so the page degrades to current behavior instead of going blank.
- **D6: Session identity for the probe query.** The probe query runs with empty prompt and default options in the main process, reusing the same spawn environment as existing session queries (login-shell env capture already in place). No session record cleanup needed: an empty run produces a throwaway transcript under `~/.claude/projects/`.
- **D7: Renderer shows the set as three stacked source cards under the section heading.** The page keeps the section heading row; the heading text is a localized installed summary — `Installed N items` (new i18n keys `settings.agent.subagent.installed` and `settings.agent.subagent.itemCount`, en uses `_one`/`_other` plurals), where the `N items` part renders in `text-foreground-subtlest` and the total counts every resolved subagent — with the "Add" button at the row's right end at default button size. Below, one shared scroll container stacks three cards (built-in, plugin, custom) with generous spacing between them (`gap-8`); each card opens with a subtle-emphasis text-only source label (`text-foreground-subtlest`, localized name, no icon) and lists that source's rows, which keep their icon-only source badge. No tabs, no counts per card, no anchor-scroll logic. No new dependency.

## Risks / Trade-offs

- [Each resolve spawns a Claude session process, seconds of latency] → resolved once per app session behind the cache; show a spinner on first open.
- [Snapshot goes stale after installing/removing a plugin mid-session] → accepted product trade-off; the set reflects next app launch.
- [Probe query writes a throwaway session transcript to `~/.claude/projects/`] → acceptable clutter; revisit if it proves noisy.
- [Name-based misclassification: a user file named like a built-in, e.g. `Explore.md`] → file match wins over built-in, which matches Claude Code's own shadowing precedence; row then shows as editable custom agent.
- [SDK behavior drift on `supportedAgents()`] → isolated in one service module with its own test seam (mocked query).

## Migration Plan

Additive RPC and renderer changes only; no data migration. Rollback = revert; the old file-scan list remains intact throughout.

## Open Questions

(none)
