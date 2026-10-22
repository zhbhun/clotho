---
type: "Reference"
title: "Prompt Composer"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-2cd064a9f9a2f088af86f12c
    resource: repo://src/renderer/pages/workbench/session/prompt/add-menu.tsx
  - id: openwiki-source-07b989869093758825053497
    resource: repo://src/renderer/pages/workbench/session/prompt/atom-navigation.ts
  - id: openwiki-source-37ed93dbd7a319568223fd6d
    resource: repo://src/renderer/pages/workbench/session/prompt/completion-extension.ts
  - id: openwiki-source-122d00e1a7e6a1e628a10cf8
    resource: repo://src/renderer/pages/workbench/session/prompt/content.ts
  - id: openwiki-source-2642f24d265434d98e4f5ce6
    resource: repo://src/renderer/pages/workbench/session/prompt/context-usage-popover.tsx
  - id: openwiki-source-01b0cdcc397e2f2b1f96b6e8
    resource: repo://src/renderer/pages/workbench/session/prompt/context-usage-rows.ts
  - id: openwiki-source-80d118b2b7406be2d09fc876
    resource: repo://src/renderer/pages/workbench/session/prompt/editor.tsx
  - id: openwiki-source-b5b80e5ff3a96c80f624d4ee
    resource: repo://src/renderer/pages/workbench/session/prompt/file-menu.tsx
  - id: openwiki-source-01f96a396eea31e362a01fed
    resource: repo://src/renderer/pages/workbench/session/prompt/index.tsx
  - id: openwiki-source-01ff1d85b9f04e458cde8824
    resource: repo://src/renderer/pages/workbench/session/prompt/mention-selection.ts
  - id: openwiki-source-39c348acd9e1fd4421e5c2c5
    resource: repo://src/renderer/pages/workbench/session/prompt/slash-command.tsx
  - id: openwiki-source-c41fc31bea5b7eda45503a88
    resource: repo://src/renderer/pages/workbench/session/prompt/use-completion.ts
  - id: openwiki-source-0aab80db8ea90ac86894220e
    resource: repo://src/renderer/pages/workbench/session/prompt/use-prompt-history.ts
  - id: openwiki-source-3e68bada1378fa30b7333bf0
    resource: repo://src/renderer/pages/workbench/session/services/attachments.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---


# Prompt Composer

[prompt/](../src/renderer/pages/workbench/session/prompt/) is the session's input area. [index.tsx](../src/renderer/pages/workbench/session/prompt/index.tsx)'s `PromptComposer` is the shell; [editor.tsx](../src/renderer/pages/workbench/session/prompt/editor.tsx)'s `PromptMarkdownEditor` is the editor proper.

## The editor proper

`PromptMarkdownEditor` uses Tiptap 3 with a deliberately short extension list: Document, Paragraph, Text, HardBreak, UndoRedo, plus four custom extensions — `FileMention`, `SlashCommand`, `MentionSelection`, `PromptAtomNavigation`, `EditorCompletion` — and Placeholder.

Keyboard handling concentrates in `editorProps.handleKeyDown`:

- With the completion menu open, `ArrowUp/Down`, `Enter`, `Escape`, and `Tab` all go to the menu (returning false so ProseMirror does not eat them).
- Recall of already-sent prompts claims the bare arrow keys, **except during IME composition (`isComposing` / keyCode 229)** — then arrows must pick candidates; modified arrows (word movement, document head/tail) stay with the editor.
- `Enter` submits, but likewise lets IME's confirming Enter pass (keyCode 229).
- `clipboardTextSerializer` serializes clipboard slices to markdown — chips travel as `@path` / `/command`, so copying inside the editor keeps references and pasting elsewhere stays readable.

`handlePaste`: clipboard files (images, PDFs) go to `onPasteFiles`; plain text containing path-like `@` references converts to chip nodes on insert (see [Content model](#content-model)); the rest goes to ProseMirror's default — real clipboards usually carry an HTML flavor too, which the schema flattens to text, so it only intervenes when a file reference is plausible.

Three refs hold off async: the `useEditor` instance exists only after first render, so every event handler reads the latest callback through a ref rather than binding at render time.

On `value` changes, a `queueMicrotask` compares serialized results and calls `setContent` only when different (`emitUpdate: false`, so external hydration does not bounce back as a user edit). `setEditable` also passes `false` — the comment notes it re-emits an update, and leaving it on would write an empty editor back before the draft restores.

`useImperativeHandle` exposes `focus()` and `insertTrigger('@' | '/')`: the latter inserts the trigger character at the cursor (or document end when never focused), **prepending a space when the preceding character is not whitespace** — the suggestion matcher only fires when the trigger follows whitespace or sits at a text block's start.

## Content model

[content.ts](../src/renderer/pages/workbench/session/prompt/content.ts) defines the round trip between TipTap JSON and plain text.

Serialization `promptDocToMarkdown`: `text` verbatim, `hardBreak` → `\n`, `fileMention` → `@path` (with line hint), `slashCommand` → `/name`. **Each chip owns one space on either side** — at render that space is the chip's padding; serializing writes it out so the restore parser has boundaries; when a boundary space is missing, `needsBoundarySpace` adds one, unless the next character is punctuation (the comma in `/review,` hugs the chip, no space).

Restore `markdownTextToDoc` is the inverse of serialization, with one extra: **a restored draft turns every word-initial slash token directly into a command chip without consulting the command list**. The comment says this is deliberate — the composer cannot wait for the session to start and fetch the command list before showing reference blocks, and the token serializes back identically.

File-reference escaping: plain paths go `@path`; paths with whitespace, quotes, backslashes, or `@` use `@` + a JSON string, leaning on JSON quoting for reversibility without an extra field. Restore's `parsedFileMention` decodes accordingly.

**Line hints** (`#125`, `#L7-11`, `:12:3`) split off the path into `lineHint`: they render with the chip (small gray text) and re-concatenate onto the path when serializing. `stripLineNumberSuffix` also strips them during completion search — typing `@foo.ts#20` must not shrink the search results.

`looksLikeFilePath` (has a path separator or ends in an extension) decides whether a pasted `@` token becomes a chip: ordinary mentions like `@reviewer` stay verbatim.

`hasPromptAtoms` lets callers check whether the document holds any chips.

## Completion

[completion-extension.ts](../src/renderer/pages/workbench/session/prompt/completion-extension.ts) mounts two plugins via `@tiptap/suggestion`: `/` triggers slash commands, `@` triggers files. Both require `allowedPrefixes` to be whitespace (space, newline, tab).

Plugins and React communicate through `setEditorCompletionBridge` (`WeakMap<Editor, Bridge>`): suggestion only produces snapshots (kind, range, query, items, clientRect); the menu's rendering, keyboard, and selection all live on the React side. The menus can therefore be React components while suggestion's `render` stays an empty shell.

`shouldShowFileCompletion` handles one subtlety: **moving the cursor into an existing `@path` must not pop the menu**. It opens only when the trigger was just typed/inserted (`docChanged` and the previous character is `@`), or the cursor sits after a `/` with only whitespace following; an already-open menu persists.

[use-completion.ts](../src/renderer/pages/workbench/session/prompt/use-completion.ts) is the controller:

- File results and query live in `fileState`, synced by ref to the bridge's `fileItems(query)` — **results return only when the query matches**, so a stale async reply cannot land on a changed query.
- `clampActiveIndex` keeps the highlight in range when async results arrive; same-range updates keep the highlight, new ranges reset to 0.
- File search goes through [File Search](./main-file-search.md): empty query → `listRootEntries`, otherwise `search`, capped at 40; unsupported capability shows the matching copy (missing project / unsafe root → "file search not supported", otherwise the main process's message).
- Opening file completion calls `enterWarmup`, closing calls `exitWarmup` — fff's native index builds on demand and dies after 60 idle seconds.
- When the highlighted item changes, it fetches `getOutline`, rendering that file's ancestor-directory chain on the menu's right (below).
- Menu position comes from [menu-position.ts](../src/renderer/pages/workbench/session/prompt/menu-position.ts): prefer anchoring left of the caret, right-align when the right side lacks room; flip vertically per `placement` preference and available space; final coordinates clamp inside the viewport's 12px padding. `resizeKey` (result count / outline rows / message changes) triggers remeasure, since async content changes menu height.

Both menus portal to body: `SlashCommandMenu` (420px wide, sorted by matchIndex, prefix hits first) and `FileCompletionMenu` (31rem wide, outline on the right). `FileCompletionMenu`'s scrolling is hand-rolled: the comment explains `scrollIntoView` is unreliable on Base UI's viewport, so it sets `viewport.scrollTop` directly to bring the highlighted row into view, then aligns the outline with the scrolled row; when the outline would overflow the window's bottom, it lifts the whole panel instead of compressing it.

## Chips

**`FileMention`** ([files.tsx](../src/renderer/pages/workbench/session/prompt/files.tsx)): inline atom, `selectable: false`. Attributes `path`, `name`, `mimeKind`, `lineHint`. `classifyPath` sorts by extension into image/markdown/text/code/file, each with an icon; image chips show a thumbnail via a `file://` URL, falling back to the icon on load failure with a large-image popover on hover; non-images show the full path tooltip. Hover reveals a delete button (`deleteNode()`).

**`SlashCommand`** ([slash-command.tsx](../src/renderer/pages/workbench/session/prompt/slash-command.tsx)): inline atom; attributes besides `name` include `aliases`, `argumentHint`, `description`. A hover popover shows the command title (the last segment of `foo:bar`, hyphens to spaces, first letter capitalized) and description. The description **comes from node attributes first, then the `SlashCommandsContext` command list** — restored chips carry only the command name, so it renders before the session starts and backfills the description when the list arrives, without rewriting the document.

`prepareSlashCommands` filters two things: `HIDDEN_COMMANDS` (`clear`, `config`, `context`, `model`, `usage`, about 40 total — the comment: hidden in the composer but the underlying SDK capability is not disabled) and duplicates (first wins). `resolveDirectSlashCommand` recognizes input that is exactly `/<command>`; a hit on `clear`/`compact`/`config`/`context`/`rename` takes the [special submit path](#submit-semantics) instead of sending as a normal prompt.

## Selection and navigation

[MentionSelection](../src/renderer/pages/workbench/session/prompt/mention-selection.ts): browsers never paint a native selection over inline chips, so ProseMirror decorations add a `mention-in-selection` class to chips the selection covers, repainted by prompt.css in the editor's selection color. An empty selection clears the decorations.

[PromptAtomNavigation](../src/renderer/pages/workbench/session/prompt/atom-navigation.ts): the left/right arrows **skip over a whole chip** when the cursor hugs it (moving by nodeSize) instead of walking in character by character. Active only with an empty selection.

## Attachments

The flow lives in [services/attachments.ts](../src/renderer/pages/workbench/session/services/attachments.ts) plus the composer's `handleAddFiles` / `handlePasteFiles`:

1. **Select**: `onSelectFiles(projectPath)` → main-process `showFilesPicker` returns absolute paths; or pasted `File[]`.
2. **Read**: `readPickedFiles` hands `{ name, sourcePath }` to the main process's `attachmentRead`; `readPastedFiles` first `FileReader`s files into base64 (stripping the data-URL prefix) then takes the same path. Validation, sniffing, and size caps all live in the main process (see [File Search and Attachments](./main-file-search.md)).
3. **Dedupe**: `appendLoadedAttachments` skips files already added by `content.source.path` — the clotho-local provenance field the main process writes in. `handleAddFiles` also pre-filters by path after selection.
4. **Into the composer**: `loadedToAttachment` keeps only `name` and `content`, `setAttachments` appends; rejected files toast with their names.

`attachmentFromPart` is the reverse: restoring a content part from a history message into a composer attachment (used when editing messages), accepting only PNG/JPEG/GIF/WebP images and PDF/plain-text documents.

## Context usage

Three components:

**[ContextUsageRing](../src/renderer/pages/workbench/session/prompt/context-usage-ring.tsx)**: an SVG ring of radius 7, `strokeDashoffset` showing the percentage; `ContextUsageSamplingRing` is the same spot's loading state (a 28%-arc spinner) shown while on-demand sampling is in flight.

**[ContextUsagePopover](../src/renderer/pages/workbench/session/prompt/context-usage-popover.tsx)**: a hover card (150ms to open, 100ms to close). Top shows the percentage and a `used/max` mark; middle, a category-colored stacked bar; below, a category legend; bottom, the average cache hit rate (`—` when no data). Opening calls `detail.onOpen()` to trigger on-demand sampling.

**[context-usage-rows.ts](../src/renderer/pages/workbench/session/prompt/context-usage-rows.ts)** translates the SDK's raw categories into display rows: drop free space, the autocompact buffer, and zero-token items; merge by `CATEGORY_STYLES` substring matching — **match order is priority**, "System prompt" must precede the generic tool matcher, and "MCP" must too (both names contain "tool"); same-category raw entries merge into one row with tokens summed, so MCP's two rows collapse into one. Unmatched categories keep their names, sharing a rotating palette (colors assigned by appearance order, stable across renders). `formatTokenCount` shows the raw value under 1K, else one decimal in K.

## Submit semantics

`handleSubmit` branches three ways:

- **While streaming**: `/context` still opens the context panel immediately (local data, no queuing); otherwise the draft queues after the current turn as a `pendingMessage`.
- **Idle and a direct slash command**: clear the input; `context` opens the panel, the rest run through `onRunCommand` (not sent as a normal prompt).
- **Otherwise**: submit normally.

The send button plays four roles, decided by `isStreaming` / `canQueuePending` / `isSubmitting` / `showResumeButton`: stop (square), queue (up arrow), sending (spinner), resume an interrupted turn (play). The resume button appears only when the composer is empty — with content it sends as a new prompt.

[PendingMessagePanel](../src/renderer/pages/workbench/session/prompt/pending-message.tsx) displays queued messages: attachment-only messages show an "N images / N files" summary, the edit button moves the message back into the composer, the delete button discards it.

## Prompt history

[use-prompt-history.ts](../src/renderer/pages/workbench/session/prompt/use-prompt-history.ts) implements terminal-style recall of sent prompts: with an empty composer, `ArrowUp` walks back, `ArrowDown` forward, **and walking past the newest entry restores the draft saved before entering history**. Any input change not caused by navigation itself ends navigation (an `useEffect` comparing `prompt !== navigation.recalled`), handing the arrows back to ordinary cursor movement.

## Other entries

**[AddMenu](../src/renderer/pages/workbench/session/prompt/add-menu.tsx)**: the composer's bottom-left `+` popup — attachments, `@` (insert the file trigger), `/` (insert the command trigger), plus the session area's refresh-session, compact, and status. The comment notes it builds on the native menu so the first item auto-focuses and arrows move focus out of the input. Trigger-type items return focus to the editor via `onOpenChangeComplete`; only an Escape close keeps focus on the trigger (`finalFocus` checks `closeReasonRef`).

**[model-menu](../src/renderer/pages/workbench/session/prompt/index.tsx)**: model selection grouped by provider, group titles carrying quota rings (`ProviderUsageRings`), **refreshing quotas once per open** — the shared store merges in-flight requests and keeps old pills until new results arrive. `ModelBrandIcon` derives the icon from model id and provider (see [model-brand-icon.tsx](../src/renderer/pages/workbench/session/prompt/model-brand-icon.tsx)); narrow containers (`@max-[449px]`) hide the model name and chevron.

**Permission menu**: the static `PERMISSION_MODE_OPTIONS` list, each with icon, title, and description.

`PromptComposerShortcuts` binds `workbench.picker.model.open`, `workbench.picker.permission.open`, and `workbench.picker.file.open` to their menus (see [Shortcut System](./renderer-shortcuts.md)).
