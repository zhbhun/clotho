---
type: "Reference"
title: "Tool Renderers"
description: "The renderer registry turning each tool call and its result into a conversation line: contract, aliases, MCP fallback, and the per-family renderers."
tags: ["renderer", "tools", "conversation", "registry"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a01
    resource: repo://src/renderer/pages/workbench/session/tools/registry.tsx
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a02
    resource: repo://src/renderer/pages/workbench/session/tools/shared/types.ts
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a03
    resource: repo://src/renderer/pages/workbench/session/tools/shared/content.tsx
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a04
    resource: repo://src/renderer/pages/workbench/session/tools/shared/command.tsx
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a05
    resource: repo://src/renderer/pages/workbench/session/tools/shared/file-path.ts
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a06
    resource: repo://src/renderer/pages/workbench/session/tools/shared/utils.ts
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a07
    resource: repo://src/renderer/pages/workbench/session/tools/task-summary.tsx
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a08
    resource: repo://src/renderer/pages/workbench/session/tools/workflow.tsx
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a09
    resource: repo://src/renderer/pages/workbench/session/tools/workflow-progress.tsx
  - id: openwiki-source-8c1e8a4bd51f4d0f9ab1e46b5c1e0a10
    resource: repo://src/renderer/pages/workbench/session/tools/ask-user-question/request-panel.tsx
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Tool Renderers

[pages/workbench/session/tools/](../src/renderer/pages/workbench/session/tools/) renders one tool call as a line in the conversation. [registry.tsx](../src/renderer/pages/workbench/session/tools/registry.tsx) is the sole lookup table; [shared/types.ts](../src/renderer/pages/workbench/session/tools/shared/types.ts) is the contract; the remaining files carry one renderer per family. Consumers are [ToolItem](./renderer-conversation.md) and the timeline's folding logic.

## The ToolRenderer contract

```ts
interface ToolRenderer {
  icon: LucideIcon
  iconFor?: (input, toolUseResult?) => LucideIcon
  label: string                      // i18n key
  description: string                // i18n key, tooltip copy
  summary: (input, result?, toolUseResult?, t?) => string
  inputView: (input) => ReactNode
  annotationView?: (input) => ReactNode
  hasBody?: (input, result?, images?, toolUseResult?, isError?) => boolean
  bodyView?: (input, result?, images?, toolUseResult?) => ReactNode
  bodyItemView?: (context: ToolItemContext) => ReactNode
  footerView?: (input, result?, images?, toolUseResult?, isError?) => ReactNode
  itemView?: (context: ToolItemContext) => ReactNode
  flushBody?: boolean
  floatingFooter?: boolean
  opensSubagent?: boolean
  canOpenSubagent?: (toolUseResult, isError) => boolean
}
```

Fields serve four layers:

- **heading**: `icon` / `iconFor` / `label` / `description` / `summary`. `summary` is the one-line tail text; most renderers take one field (Read takes the filename, Grep the pattern, Bash the description or command).
- **body**: `hasBody` decides whether expandable content exists; `bodyView` is the standard "input + output" body, while `bodyItemView` is the alternative receiving the whole `ToolItemContext` — renderers needing `taskItems`, `backgroundTask`, or `onRespond` take this path.
- **footer**: `footerView` plus `floatingFooter` (floating bottom-right rather than occupying a row) for search/fetch-style tools "with metering".
- **interaction**: `opensSubagent` turns the whole row into "open subagent" instead of expanding; `itemView` is the highest-priority total replacement — a non-null return takes over rendering completely.

`ToolItemContext` packs one call's full context: name, input, result, toolUseResult, projectPath, images, coalescedReads, taskItems, toolUseId, onOpenSubagent, pendingRequest, onRespond, isError, isRunning, backgroundTask.

`ToolItem`'s assembly order: `itemView` → else draw an expandable card per `hasBody` (defaulting to "has bodyItemView or input or result or images"); the expanded area prefers `bodyItemView`, then `bodyView`, finally the default Input/Output/Images three-section body. Subagent rows do not expand; clicking calls `onOpenSubagent(toolUseId)` directly.

## RENDERERS and aliases

`RENDERERS` is a `Record<string, ToolRenderer>` with about 60 keys. **One renderer hangs under multiple names**, because the same tool carries different names at different layers:

| Renderer | Aliases |
| --- | --- |
| readRenderer | `Read`, `FileReadTool`, `ReadCoalesced` |
| writeRenderer | `Write`, `FileWriteTool` |
| editRenderer | `Edit`, `FileEditTool` |
| grepRenderer | `Grep`, `GrepTool` |
| globRenderer | `Glob`, `GlobTool` |
| bashRenderer | `Bash`, `BashTool` |
| powerShellRenderer | `PowerShell`, `PowerShellTool` |
| taskOutputRenderer | `TaskOutput`, `TaskOutputTool`, `task_output` |
| taskStopRenderer | `TaskStop`, `TaskStopTool`, `task_stop` |
| monitorRenderer | `Monitor`, `MonitorTool` |
| webSearchRenderer | `WebSearch`, `WebSearchTool` |
| webFetchRenderer | `WebFetch`, `WebFetchTool` |
| todoRenderer | `TodoWrite`, `TodoWriteTool` |
| askUserQuestionRenderer | `AskUserQuestion`, `AskUserQuestionTool` |
| agentRenderer | `AgentTool`, `Agent`, `Task` |
| taskListRenderer | `TaskList`, `TaskListTool` |
| taskGetRenderer | `TaskGet`, `TaskGetTool` |
| cronCreateRenderer | `CronCreate`, `CronCreateTool` |
| cronListRenderer | `CronList`, `CronListTool` |
| cronDeleteRenderer | `CronDelete`, `CronDeleteTool` |
| taskCreateRenderer | `TaskCreate`, `TaskCreateTool` |
| taskUpdateRenderer | `TaskUpdate`, `TaskUpdateTool` |
| skillRenderer | `Skill`, `SkillTool` |
| toolSearchRenderer | `ToolSearch`, `ToolSearchTool` |
| enterPlanModeRenderer | `EnterPlanMode`, `EnterPlanModeTool` |
| exitPlanModeRenderer | `ExitPlanMode`, `ExitPlanModeTool` |
| workflowRenderer | `Workflow`, `WorkflowTool` |

Three naming sources: **camelCase originals** (SDK side), **the `Tool` suffix**, and **snake_case** (`task_output` / `task_stop`, the task system's set).

`ReadCoalesced` deserves its own note: consecutive reads of one file in a session fold into a single `ReadCoalesced` entry (see [Conversation Rendering](./renderer-conversation.md)), so readRenderer's `itemView` checks `coalescedReads` and renders `ReadCoalescedCard` — **one card showing multiple rows, each a path plus line range**, rather than piling the folded reads into one row.

## MCP and fallback

`getToolRenderer(name)`'s lookup order:

1. Empty name → `DEFAULT_RENDERER`
2. A `RENDERERS` hit → that renderer
3. Strip the `Tool` suffix; a name starting with `mcp__` → derive from the default renderer, **icon Plug, label `tools.default.mcpLabel`, summary returning `mcpToolName(trimmedName)`**
4. Any other unknown tool → the default renderer, `summary` returning empty

`mcpToolName` converts `mcp__server__tool_name` into `server:tool_name` (prefix stripped, all `__` swapped for `:`).

`DEFAULT_RENDERER`'s `inputView` is `<JsonInput>` — the input pretty-printed as JSON. Unregistered tools thus always show their full parameters.

`getToolDisplayName(name, renderer, t)` decides the display name: **registered tools and MCP tools both show the translated label** ("Read", "MCP"); other unknown tools show the raw name minus the `Tool` suffix. The comment explains the tradeoff: an MCP row's fully-qualified name lives in the summary while the row title shows just "MCP"; an unknown built-in tool's name is its identity, and the summary repeating it would only be redundant.

`getToolSummary` has one front branch: **file-family tools (`isFileToolName`) uniformly go through `fileToolSummary`**, bypassing the renderer's own summary. Those seven names (Read/FileReadTool/ReadCoalesced/Write/FileWriteTool/Edit/FileEditTool) share one path-formatting set, consistent with the alias table.

## By family

### File family

**read**: inline entry, no body. `itemView` renders `ReadCoalescedCard`, one row per file; paths are **clickable** — `ReadPathLink` fires `appOpenLink` with a project-relative href, the comment noting the main process's link guard accepts only in-project paths, so out-of-project clicks are no-ops. Summaries carry line ranges: with `limit`, it computes `offset..offset+limit-1`.

**write**: summary takes the filename; body is `<HeightCollapsible text={content} mono />`.

**edit**: `GitDiffPreview` draws `old_string` / `new_string` as a pseudo diff — `--- a/`, `+++ b/`, `@@ -1,n +1,n @@` meta lines, then old lines in red, new in green. Each side takes only the **first 6 lines**, overflowing with a `…`. `flushBody: true` makes the card content edge-to-edge (no padding), because diffs need full width.

### Shell family

[shared/command.tsx](../src/renderer/pages/workbench/session/tools/shared/command.tsx)'s `commandRenderer(label, description, icon, prompt?)` is the shared factory for Bash and PowerShell, PowerShell only swapping the prompt to `PS>`.

It distinguishes **foreground and background**: with `run_in_background` true (or the context carrying a `backgroundTask`), it renders `BackgroundTaskTranscript`, else `TerminalTranscript`. Background details dispatch by status: running shows "running in background · taskId"; completed shows output when present, else completion or exit code; failed takes output or summary; stopped concatenates output and "stopped". Foreground is `$ command` plus output, both through `HeightCollapsible mono edgeOverlay`.

**Monitor** reuses `BackgroundTaskTranscript` as a read-only window onto a background task.

### Search family

**Grep / Glob**: `ParamsInput` renders a monospace `key: value` list. Grep shows pattern and path (or output_mode); Glob shows only pattern. Neither has a body.

**WebSearch**: the body is a result list (icon + title or URL as external links), with `floatingFooter` showing "elapsed · N results". `hasBody` checks `toolUseResult.results` is an array.

**WebFetch**: the body is the fetched content; `floatingFooter` shows elapsed and bytes via `formatMs` / `formatBytes`.

**ToolSearch**: MCP tool-search results; list items format through `mcpToolName`, footer showing hit count.

### Task family

**TaskCreate**: the comment notes it **only displays during execution** — after submission the call folds into the task card (see [Conversation Rendering](./renderer-conversation.md)), so the row never has a body.

**TaskUpdate**: `iconFor` swaps icons by task state (in_progress ListStart, completed ListCheck, otherwise ListEnd). `updatedTask` takes the id from input and the target state from `toolUseResult.statusChange.to` (falling back to input's state), with the summary being `subject → state`. The body uses `TaskSummary`, **preferring the context's full taskItems and only falling back to a single item when there is exactly one**.

**TaskList / TaskGet**: read `toolUseResult`, parsing via `extractTaskList` (an array, missing status backfilled `pending`) and `extractTaskDetail` (the `.task` object); states pass through `normalizeTaskStatus`, unrecognized values uniformly pending. Both share `TodoStatusBox` drawing the status circle.

**TaskOutput / TaskStop**: share `TaskOutputTranscript`. It parses an XML-style result text — `xmlField` regex-extracts `<retrieval_status>`, `<task_id>`, `<task_type>`, `<status>`, `<exit_code>`, `<output>`. With output it shows the output; otherwise the structured details; both empty falls back to the raw text.

**TaskSummary** ([task-summary.tsx](../src/renderer/pages/workbench/session/tools/task-summary.tsx)) is the task card itself: check rows plus a `completed/total` count, with `flat` mode stripping the card shell for use inside tool cards. An in_progress task's second line shows `activeForm` ("what is running"), others show description.

### Todo family

**TodoWrite**'s renderer reads input todos (`extractTodoItems`), summary `completed/total`, body the `TodoSummary` list. `TodoStatusBox` distinguishes states with four icons: done checks, cancelled crosses, in-progress (`mode: 'loading'`) spins, in-progress (static) stars.

**TodoProgress** is the dock's progress bar (separate from tool cards).

### Workflow family

[workflow.tsx](../src/renderer/pages/workbench/session/tools/workflow.tsx) is the most complex. `WorkflowToolItem` first runs `parseWorkflowLaunch` over input/result/toolUseResult extracting runId, taskId, workflowName, summary, script, then merges with the reference found by toolUseId in `useWorkflowContext()` — **context wins, parse results backstop**.

`WorkflowRunView` has three shapes: no run (still launching, or launch failed) shows waiting/failure copy; `run.isPartial` flattens agents into a grid (early on only agents are known, not the phase split); a complete run renders the phase timeline.

The phase list `workflowPhases` starts from `run.phases`, **backfilling any phaseIndex present in agents but undeclared in phases with a default title** ("Phase N"), so agents with an assignment are not lost when a phase is missing.

Each agent gets a node: status icon (running spins, done checks, failed crosses, others a dashed circle), model, elapsed, token count (`Intl.NumberFormat` compact, no decimals at ≥100), plus one line of current-activity summary — running takes `lastToolSummary ?? promptPreview`, failed/stopped take `lastToolSummary ?? resultPreview`. With an `agentId` it is clickable; `onOpenAgent` opens that subagent.

[workflow-progress.tsx](../src/renderer/pages/workbench/session/tools/workflow-progress.tsx)'s `WorkflowProgress` is the same data's compact dock version.

### Plan family

**EnterPlanMode**: icon and label only; summary and body empty — entering plan mode is instantaneous, nothing to expand.

**ExitPlanMode**: `summary` **infers** approval from the result: lowercasing the `behavior`/`status`/`decision`/`result` fields joined with the result text, matched against two regex word lists (deny/denied/reject/rejected/refuse/refused and allow/allowed/approve/approved/accept/accepted); no structured hit but the result carrying `filePath`/`plan`/`isAgent` fields also counts approved. With no structured fields, text is all there is.

### Others

**Skill**: summary takes `skill` or `name`, no body.

**AskUserQuestion**: `askQuestions(input, toolUseResult)` takes the question list from input or result, `extractAnswerMap` parses answers from the result text, `askHeadline` produces the row summary (how many questions, asking what), body is `AskQuestionCards` — one card per question with options marked by selection state. The interactive panel while waiting lives in [request-panel.tsx](../src/renderer/pages/workbench/session/tools/ask-user-question/request-panel.tsx).

**Agent**: `opensSubagent: true` makes the whole row open the subagent view. `canOpenSubagent` requires an agentId **even on error** — an error without one has nothing to inspect. `hasBody` is likewise true only when "errored and no agentId", laying the cause out inline.

## Shared helpers

### Content rendering

[shared/content.tsx](../src/renderer/pages/workbench/session/tools/shared/content.tsx):

- **`CollapsibleRegion`**: collapses past 250px (`BODY_COLLAPSE_THRESHOLD_PX`) with a bottom gradient mask and a centered expand/collapse button. Measured with `scrollHeight` plus a ResizeObserver, **never a line-count estimate** — monospace line heights are unstable.
- **`HeightCollapsible`**: text with optional mono, wrapped in CollapsibleRegion.
- **`PreText`**: a `<pre>` with `whitespace-pre-wrap break-words`, so long lines wrap instead of overflowing horizontally.
- **`ImageGallery`**: base64 data-URL thumbnails, click for fullscreen, Esc closes.
- **`ParamsInput`**: monospace `key: value` list, empty values filtered.
- **`JsonInput`**: JSON pretty-print, falling back to `String(input)` when `JSON.stringify` throws.
- **`ToolHeading` / `ToolName` / `ToolIcon` / `ToolGlyph` / `WorkItemLabel` / `SectionLabel` / `ToolResultNote`**: parts for row heads and section labels. `ToolName` glows with `ShinyText` while running — the comment notes **the running glow sits on the name, not the icon**.

### Path formatting

[shared/file-path.ts](../src/renderer/pages/workbench/session/tools/shared/file-path.ts):

- `filePath` takes `file_path` or `path`; `fileName` the last segment (backslashes tolerated).
- `relativeProjectPath` converts in-project paths to relative, separators normalized to `/`; a path equal to the project root falls back to the filename; out-of-project paths return verbatim.
- `compactDisplayPath` compresses paths over 4 segments into `first2/.../last2`, keeping the root slash — **for inline summaries**.
- `relativeDisplayPath` leaves middle segments intact, for `appOpenLink` hrefs (a compressed path is unresolvable by the main process).

### Generic utilities

[shared/utils.ts](../src/renderer/pages/workbench/session/tools/shared/utils.ts): `pickString` (first non-empty string or number by priority), `recordValue` (safely narrow unknown to an object), `mcpToolName`, `formatMs` (ms under 1000, else one-decimal seconds), `formatBytes` (B / KB / MB tiers).
