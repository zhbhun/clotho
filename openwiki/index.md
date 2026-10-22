---
okf_version: "0.2"
---

# Files

- [Build and Testing](build-testing.md)
- [Main Bootstrap](main-bootstrap.md) - bootstrap()'s startup order, how IPC handlers register, and the before-quit shutdown flow.
- [Claude Service](main-claude-service.md) - how createClaudeDesktopService assembles the modules as the RPC's sole facade, and the validation rules for the model catalog and providers.
- [File Search and Attachments](main-file-search.md) - the project file search's cascading multi-backend strategy, root-directory safety checks, and the main process's attachment reading and validation.
- [Logging](main-logging.md) - the logtape configuration, file rotation, redaction pipeline, and how RPC and renderer logs flow into the main process.
- [App Menu and System Integration](main-menu.md) - how the native application menu is built and where its accelerators come from, plus the main process's smaller integrations: dialogs, external links, the task manager.
- [Model Proxy](main-model-proxy.md) - how a local HTTP proxy lets the Claude SDK call OpenAI-compatible providers, and the three protocol translation layers: request, response, streaming.
- [Query Runner](main-query-runner.md) - starting and stopping Claude Agent SDK queries, streaming forwarding, the tool-permission round trip, and recycling and replay of resident session queries.
- [Session Transcripts](main-sessions.md) - reading Claude session transcripts from disk: JSONL parsing, main-chain building, metadata extraction, history loading, subagents and workflows, and transcript surgery.
- [Main Storage](main-storage.md)
- [Windows](main-windows.md) - the lifecycle of the two window kinds (free and project), registry invariants, geometry state persistence, and the window RPC surface.
- [Workspace and Projects](main-workspace.md) - project and workspace state on disk: the projects.json registry, project CRUD, session ownership merging, and per-project git operations.
- [Overview](overview.md)
- [Preload Bridge](preload.md)
- [Quickstart](quickstart.md)
- [Renderer Bootstrap](renderer-bootstrap.md)
- [Composer](renderer-composer.md)
- [Conversation Rendering](renderer-conversation.md) - how one session transcript becomes rendered conversation lines: message parsing, turn folding, tool states, virtual scrolling, and live assembly.
- [Desktop Client](renderer-desktop-client.md) - the renderer-side bridge layer: typed request and event wrappers, the claude facade, and the renderer's own local persistence.
- [Renderer Logging](renderer-logging.md) - renderer-side logging: local loggers, the dev console sink, batched sends to the main process, and error capture.
- [Session View](renderer-session.md) - the session view: the controller governing one session's lifecycle, its stores and services, and the surrounding UI chrome.
- [Settings Page](renderer-settings.md) - the settings page: provider configuration, appearance, shortcuts, project and session defaults, and language.
- [Shortcut System](renderer-shortcuts.md) - the renderer's keyboard shortcuts: the command catalog, registry, key resolution, scopes, the recorder, and sharing with native menu accelerators.
- [Sidebar and Quick Open](renderer-sidebar.md) - the session sidebar's virtual list, grouped timeline, and drag-to-resize, plus the quick-open panel's mode prefixes, fuzzy scoring, and search.
- [Tool Renderers](renderer-tools.md) - the renderer registry turning each tool call and its result into a conversation line: contract, aliases, MCP fallback, and the per-family renderers.
- [Workbench Page](renderer-workbench.md) - the workbench page's composition, zustand store, project and session catalogs, workspace tabs, and UI-state persistence.
- [Shared Contracts](shared-contracts.md) - the type contracts under src/shared: the IPC schema, session and draft records, providers and thinking levels, and domain types shared by both sides.
