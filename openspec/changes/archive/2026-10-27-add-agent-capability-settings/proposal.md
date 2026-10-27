# Proposal

## Why

Clotho sessions already load the full Claude Code user configuration (`~/.claude`) because the Agent SDK defaults `settingSources` to all sources, but the settings page offers no way to view or manage that configuration. Users must leave the app to hand-edit `~/.claude/agents/*.md`, `~/.claude.json`, or `~/.claude/settings.json` to manage subagents, MCP servers, hooks, skills, plugins, and workflows — the exact surfaces the app already relies on at runtime.

## What Changes

- Add an "Agent capabilities" (Agent 能力) group to the settings page with six new categories: subagents (子智能体), plugins (插件), MCP servers (MCP 服务器), skills (技能), hooks (钩子), and workflows (工作流).
- All six categories manage **user-level** Claude Code configuration only (`~/.claude`); project-level configuration is explicitly out of scope.
- New main-process modules under `src/main/claude/agent-config/` that read and write the user-level Claude Code files:
  - Subagents: list/create/edit/delete `~/.claude/agents/*.md` (frontmatter + body).
  - MCP servers: read/modify/write `mcpServers` in `~/.claude.json` with read-fresh-then-atomic-replace to coexist with concurrently running CLI processes.
  - Hooks: read/modify/write the `hooks` field in `~/.claude/settings.json` using the CLI file format (`{ event: { matcher, hooks: [{type: 'command', command}] } }`), command-type hooks only.
  - Skills: list/enable/disable/delete directories under `~/.claude/skills/` containing `SKILL.md`.
  - Plugins: list installed plugins from `~/.claude/plugins/installed_plugins.json`, enable/disable via `enabledPlugins` in `~/.claude/settings.json`; marketplace add/remove operates on `~/.claude/plugins/known_marketplaces.json` with `git` clone into `~/.claude/plugins/marketplaces/`.
  - Workflows: list/create/edit/delete workflow script files under `~/.claude/workflows/`.
- New typed desktop RPC requests (`claudeListSubagentConfigs`, `claudeSaveSubagentConfig`, …) registered in `bootstrap.ts` and implemented via `claude-service.ts`, following the existing provider-management pattern.
- Settings sidebar becomes grouped ("基础设置" / "Agent 能力") instead of a flat category list.

## Capabilities

### New Capabilities

- `agent-capability-settings`: The settings-page surfaces and main-process file management for the six user-level Claude Code capability domains (subagents, plugins, MCP servers, skills, hooks, workflows) — listing, creating, editing, deleting, and enable/disable semantics, plus the file-safety rules for shared files.

### Modified Capabilities

- (none — the settings page's flat category list is an implementation detail; no existing spec covers settings-page navigation.)

## Impact

- `src/shared/rpc.ts`: new request types for the six domains (user-level only).
- `src/main/claude/agent-config/`: new modules (one per domain) + tests.
- `src/main/claude-service.ts`: new service methods delegating to the agent-config modules.
- `src/main/bootstrap.ts`: new request handler registrations.
- `src/renderer/pages/settings/index.tsx`: grouped sidebar, six new category entries.
- `src/renderer/pages/settings/components/`: six new settings components + stores/services.
- `src/renderer/i18n/catalogs/`: new translation rows for all six categories.
- Risk concentrated in `~/.claude.json` (CLI-owned, frequently rewritten by running CLI processes) — mitigated by read-fresh + atomic replace on every write.
