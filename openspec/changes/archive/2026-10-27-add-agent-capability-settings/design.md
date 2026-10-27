# Design

## Context

Clotho spawns every session through the Agent SDK (`src/main/claude/runner.ts` → `normalizeOptions`). `settingSources` is not passed, so SDK 0.3.284 loads the full CLI default set (`~/.claude/settings.json`, project/local settings, CLAUDE.md, agents, skills, plugins). The user-level configuration is therefore already live at runtime — this change only adds UI + file management for it.

Existing patterns this design reuses:

- RPC shape: `src/shared/rpc.ts` types → `bootstrap.ts` `requestHandlers` → `claude-service.ts` methods (preload is a generic passthrough; no preload change).
- Settings page: flat `CATEGORIES` array in `src/renderer/pages/settings/index.tsx`, one component per category under `components/`, translations via `setting(en, zhCN, zhTW)` rows in `src/renderer/i18n/catalogs/settings.ts`.
- Safe file writes: `src/main/claude/settings.ts` already has the temp-file + rename + chmod 0o600 pattern (`writeSettings`).

Real on-disk shapes (verified on this machine):

- `~/.claude/agents/*.md` — frontmatter (`name`, `description`, `tools`, `model`) + markdown body.
- `~/.claude.json` — CLI-owned state file, top-level `mcpServers` (user scope), rewritten frequently by running CLI processes (stats, tips history, etc.).
- `~/.claude/settings.json` — CLI user settings; `hooks` field uses `{ [event]: [{ matcher, hooks: [{type: 'command', command}] }] }`.
- `~/.claude/skills/<name>/SKILL.md` — frontmatter + body.
- `~/.claude/plugins/installed_plugins.json` (v2, entries with scope/installPath/version), `known_marketplaces.json`, `marketplaces/` (git clones), `cache/`.
- `~/.claude/workflows/` — workflow script files.

## Goals / Non-Goals

**Goals:**

- One settings group ("Agent 能力") with six user-level management categories.
- Every write to a CLI-shared file is read-fresh-modify-atomic-replace, preserving unrelated fields.
- Plugin/skill enable-disable is Clotho-session-scoped and does not mutate the CLI's own enable state.

**Non-Goals:**

- Project-level configuration (`<project>/.mcp.json`, `<project>/.claude/**`).
- Writing hooks other than `{type: 'command'}`; no SDK callback hooks from the UI.
- Plugin authoring/publishing; updating installed plugins to new versions (marketplace refresh re-clones, install is copy-from-marketplace).
- Any change to session spawn behavior in `runner.ts`.

## Decisions

### D1: Edit files in place; no shadow store for content

Subagent/hook/MCP/workflow content stays in the CLI-owned files as the single source of truth. Clotho reads them on demand and writes through with atomic replace.

- Alternative considered: Clotho-owned JSON DB mirroring `~/.claude`, synced on read. Rejected: two sources of truth drift; the files are already the runtime source via `settingSources`.

Exception — enable/disable toggles: plugin and skill enable state is stored in Clotho's own settings store (`ClaudeskSettings.agentCapabilities` in `~/.clotho/settings.json`), because the CLI's own enable fields belong to the CLI and overwriting them would surprise users who switch between CLI and Clotho. Missing entry = enabled (default on).

### D2: One module per domain under `src/main/claude/agent-config/`

`subagents.ts`, `mcp-servers.ts`, `hooks.ts`, `skills.ts`, `plugins.ts`, `workflows.ts`, plus `fs-safe.ts` (shared `readJsonPreserving` / `writeJsonAtomic` helpers: re-read at save time, merge, temp+rename). Each module exports pure-ish CRUD functions taking explicit paths (mirrors `settings.ts`, testable without Electron).

- Alternative: one big module. Rejected: six domains with distinct file semantics; `settings.ts` style keeps each under ~300 lines.

### D3: `~/.claude.json` writes: last-writer-wins per field, fresh read at save

`mcp-servers.ts` never holds a cached copy of `~/.claude.json`. Every save: read file fresh → apply `mcpServers` mutation → atomic replace. If a CLI process rewrote the file between the user's list view and the save, unrelated CLI changes survive; concurrent `mcpServers` edits by the CLI itself (rare — CLI edits these only via `claude mcp`) resolve last-writer-wins. Parse failure → error to renderer, never overwrite.

### D4: Hooks use raw CLI file format, SDK `HOOK_EVENTS` list for the UI

The event dropdown enumerates the SDK's `HOOK_EVENTS` (33 events, `sdk.d.ts`). Storage format is exactly the CLI's. The UI maps its event+matcher+commands form onto that structure; no translation layer for future CLI format changes beyond the mapper itself.

### D5: Subagent frontmatter via a minimal YAML-frontmatter parser

`agents/*.md` frontmatter is flat scalar keys (name/description/tools/model). Implement a small `name: value` + single-level list parser rather than pulling a YAML dependency. Multi-line/complex frontmatter is preserved byte-for-byte on round-trip: parser keeps the raw frontmatter block, writer re-emits it verbatim and only patches the keys the UI owns.

- Alternative: `yaml` dependency. Rejected for now: frontmatter in the wild here is flat; dependency adds surface for no gain. Revisit if users hit exotic frontmatter.

### D6: Plugins: marketplace ops via `git` CLI; enable state via Clotho settings

Marketplace add = `git clone --depth 1 <url>` into `~/.claude/plugins/marketplaces/<name>` + append to `known_marketplaces.json`. Plugin install = copy directory from marketplace checkout into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>` + append to `installed_plugins.json` (matching the existing v2 entry shape, `scope: 'user'`). Both reuse whatever git binary the CLI resolves (same PATH the main process already uses for project git features).

### D7: Skills enable-disable mirrors plugins

Clotho-session-scoped disable list in `ClaudeskSettings.agentCapabilities.disabledSkills`. Enforcement happens at session spawn: `normalizeOptions` gains a `skills` filter from the settings store (SDK `skills` option accepts `string[]`). Plugin enable state enforcement likewise: enabled Clotho plugins are passed via SDK `plugins: [{type: 'local', path}]` entries pointing at each plugin's `installPath` (SDK supports local plugins); disabled ones are simply omitted.

### D8: RPC surface — four verbs per domain, batched

Per domain: `claudeList<X>`, `claudeSave<X>` (create+update), `claudeDelete<X>`; plus toggles `claudeSet<X>Enabled` for mcp/plugins/skills. Names follow the existing `claudeListProviders` family. Renderer keeps per-domain state in `pages/settings/components/` local stores (no global store needed; settings page owns lifecycle).

### D9: Settings sidebar grouping without changing keyboard nav contract

`CATEGORIES` becomes `CATEGORY_GROUPS: { labelKey, categories }[]`; arrow-key wrapping iterates the flattened list (same order as today for base categories, then the six new ones), so the existing roving-tabindex behavior is preserved with no behavior change for existing categories.

## Risks / Trade-offs

- [Running CLI clobbers Clotho's `~/.claude.json` edit mid-write] → atomic rename is a single syscall; worst case is a torn read on the CLI side, same exposure as the CLI's own writes. Fresh-read-before-write closes the lost-update window for other fields.
- [CLI format drift (installed_plugins.json v3, hooks schema changes)] → all parsing/writing concentrated in `agent-config/` modules with round-trip-preserving writers (unknown fields preserved); format changes fail loudly as parse errors, not silent data loss.
- [Marketplace clone of an untrusted repo executes nothing at clone time but plugin content is arbitrary] → install is a file copy, not an execution; plugin code runs only inside sessions, same trust level as the CLI's own plugin installs. No mitigation beyond matching CLI behavior.
- [Minimal YAML parser mishandles exotic subagent frontmatter] → raw-block preservation means worst case the file round-trips unchanged; UI reports which fields it could not read.

## Migration Plan

No data migration: all stores read files that already exist. `ClaudeskSettings.agentCapabilities` is optional; `sanitizeAppPreferences` learns a defaulting sanitizer like the existing fields. Rollback = revert; CLI files were only ever modified through the user's explicit UI actions.

## Open Questions

None.
