---
type: "Reference"
title: "Sidebar and Quick Open"
description: "The session sidebar's virtual list, grouped timeline, and drag-to-resize, plus the quick-open panel's mode prefixes, fuzzy scoring, and search."
tags: ["renderer", "workbench", "sidebar", "quick-open", "virtualization"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b581
    resource: repo://src/renderer/pages/workbench/sidebar/index.tsx
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b582
    resource: repo://src/renderer/pages/workbench/sidebar/virtual-session-list.tsx
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b583
    resource: repo://src/renderer/pages/workbench/sidebar/virtual-rows.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b584
    resource: repo://src/renderer/pages/workbench/sidebar/resize-handle.tsx
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b585
    resource: repo://src/renderer/pages/workbench/sidebar/mac-window-chrome.tsx
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b586
    resource: repo://src/renderer/pages/workbench/utils/session-list.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b587
    resource: repo://src/renderer/pages/workbench/quick-open/index.tsx
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b588
    resource: repo://src/renderer/pages/workbench/quick-open/quick-open-mode.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b589
    resource: repo://src/renderer/pages/workbench/quick-open/fuzzy-match.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b590
    resource: repo://src/renderer/pages/workbench/quick-open/use-quick-open-items.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b591
    resource: repo://src/renderer/pages/workbench/quick-open/quick-open-store.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b592
    resource: repo://src/renderer/pages/workbench/components/project-icon-picker.tsx
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b593
    resource: repo://src/renderer/pages/workbench/components/emoji-picker/emoji-data.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b594
    resource: repo://src/renderer/pages/workbench/components/emoji-picker/emoji-search.ts
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b595
    resource: repo://src/renderer/pages/workbench/components/emoji-picker/emoji-picker.tsx
  - id: openwiki-source-7b0fdd939939a08cb1c6c1f3ce55b596
    resource: repo://src/renderer/components/resizable-sidebar.tsx
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Sidebar and Quick Open

[pages/workbench/sidebar/](../src/renderer/pages/workbench/sidebar/) is the left-hand session navigation; [pages/workbench/quick-open/](../src/renderer/pages/workbench/quick-open/) is the centered jump palette. Different jobs, shared data sources: the session catalog (workbench store), timeline construction ([utils/session-list.ts](../src/renderer/pages/workbench/utils/session-list.ts)), and project display-name utilities.

## SessionSidebar

[index.tsx](../src/renderer/pages/workbench/sidebar/index.tsx)'s `SessionSidebar` is the shell, outside-in:

```
Sidebar (collapsible="offcanvas")
├── MacWindowChrome            # macOS drag region and history back/forward
├── New session button         # fixed 30px height
├── SessionListTabs            # current/history tabs, locate, back to top
├── TransientScrollArea
│   └── VirtualSessionList     # or SidebarState empty state
├── bottom fade (data-sidebar-scroll-hint)
├── settings entry
└── SidebarResizeHandle
```

`sessionTimeline` (`SessionTimelineGroup[]`) arrives from the caller; the sidebar only renders. It derives two things: `sessionCount` (the groups' session counts summed; zero renders the `SidebarState` empty state with copy switching between current/history), and the `close` scope — **only the current tab offers sessions the close menu**; the comment explains why: closing a session equals closing its tab, and history items are not open tabs. The close scope flattens the groups' sessions in display order, matching visual order.

Two "request"-style states travel down as revision counters rather than callback references: `locateRequestRevision` (locate the current session) and `enterListRevision` (enter the list from the tab bar's Tab). The list's internal virtualization effects compare old values in refs to decide whether to act; the parent merely increments a counter.

The hover preview's close detection deserves note: instead of event targets or boundary events, it listens for `mousemove` on document and compares coordinates against the container's rect. The comment explains: the panel overlaps Electron's drag region, and events crossing the drag region get swallowed. Also, the panel slides in from the pointer position, so early movement misreads as "outside" — hence a 300ms settling period first (`SIDEBAR_PREVIEW_SETTLE_MS`, covering the 200ms slide-in plus margin).

On keyboard: the tab bar's last button (back to top) intercepts Tab without Shift: if a session truly holds focus in the list, it `preventDefault`s and increments `enterListRevision` — a natural Tab cannot reach the roving focused row outside the virtual window.

## The virtual session list

[virtual-session-list.tsx](../src/renderer/pages/workbench/sidebar/virtual-session-list.tsx) flattens "group headers + session rows" into one row array for TanStack Virtual.

[virtual-rows.ts](../src/renderer/pages/workbench/sidebar/virtual-rows.ts)'s `createVirtualRows(sessionTimeline, {collapsedGroupIds})` is the one-shot linearization:

- Constants: `GROUP_HEIGHT` 32, `GROUP_GAP` 8, `SESSION_HEIGHT` 50. **Group headers are ordinary virtual rows, not sticky** — the comment explains the top edge belongs to the fixed tab bar above, and headers scroll away with their groups.
- The first group has no `hasTopGap`; every other group's header gains a `GROUP_GAP`.
- A collapsed group (currently only `ARCHIVED_GROUP_ID`) outputs only its header row, **but `count` remains the full session count** — collapsed it still shows the true number; `end` records where its last session would sit, reserved for animation.
- Returns `{groupRows, rows, sessionIndexes}`; `sessionIndexes` is a `Map` of sessionId → row number, which locate and focus translate into `scrollToIndex`.

Wiring details on the list side:

- `useVirtualizer` uses a per-row-type constant-height `estimateSize`, `overscan: 5`, `useFlushSync: false` (TanStack holds mutable scroll state; the comment asks React Compiler not to touch this hook).
- Rows position with `absolute` + `translateY(start)`, container height `getTotalSize()` — no spacer element, absolute positioning all the way.
- **Hover freezes during scroll**: trackpad inertia keeps firing scroll events after lift-off, and scrolling slides rows under a stationary pointer, so `:hover` would re-hit row after row. The fix: when the scroll gesture starts, read the hovered `[data-session-item]:hover` id into state and tag the container `data-session-list-scrolling`, with CSS suppressing row hit-testing; that row's `isHoverFrozen` applies its own hover palette. The gesture ends (`SCROLL_SETTLE_MS` 150ms without new events) and `:hover` returns to the pointer.
- Both navigation paths share one effect: arrows take the parent's `focusNavigationRevision`, Tab into the list takes the local `enterListRevision`; their sum is `listFocusRevision`, and only a real change calls `scrollToIndex(focusedIndex, {align: 'auto'})`.
- Locate is another effect, likewise ref-comparing revisions, `align: 'center'` smooth scrolling.
- The focused row's `SessionItem` receives `focusRequestRevision`, calling `focus({preventScroll, focusVisible})` in a `useLayoutEffect` — **preventScroll is critical**: a virtual row's focus scrolls the container itself, fighting the virtualizer's scrolling.

## Timeline construction

[utils/session-list.ts](../src/renderer/pages/workbench/utils/session-list.ts) is the data shaping shared by the sidebar, quick-open, and tabs.

`buildSessionTimeline({sessions, projects, sessionActivity, pinnedSessionIds, hiddenProjectIds, archivedGroup, now, t, locale})` groups sessions by date:

- Sessions sort first by `compareSessions` (`updated_at ?? created_at` descending, id on tie) — **note this is "most recently active" order, not creation order**.
- Pinned sessions enter the `pinned` group (present at the front only when any exist).
- With `archivedGroup` true, archived sessions enter the trailing `archived` group (`ARCHIVED_GROUP_ID`); with false they stay in their date groups — the current tab must still show open archived tabs.
- The rest group by `sessionDateId` (local-date `YYYY-MM-DD`), labels from `sessionDateLabel`: today/yesterday/day-before, weekday full names within this week, "month day" within this year, year prefixed across years. `calendarDayDistance` differences UTC-constructed dates, dodging DST and local-timezone offsets turning "one day" into 23 or 25 hours.
- Unsaved blank drafts (`isUnsavedDraft`) skip: they exist only as open tabs until they gain content.
- Each entry carries `projectLabel`: `projectDisplayName` with a project, else the basename of `project_path`, else the projectId.

`sessionDisplayTitle` handles default titles: an untitled session's stored title is the constant `DEFAULT_SESSION_TITLE` (`'New Chat'`), displayed through i18n in the current language — comparisons must therefore use the constant, not a literal.

The same file holds `pickOpenOrPinnedSessions` (the current tab's subset: open plus pinned) and `pickAutoArchiveCandidates` (auto-archive candidates, excluding in-use sessions; `unarchived_at` gives manual unarchiving one full grace period).

## Resizing and macOS chrome

[resize-handle.tsx](../src/renderer/pages/workbench/sidebar/resize-handle.tsx) is a `SidebarRail` remade as a divider: `role="separator"` with aria-valuemin/max/now, focusable.

Dragging uses **pointer capture**: `onPointerDown` accepts only the primary button, `setPointerCapture` stores the pointerId in a ref, and the subsequent pointermove/up/cancel listeners attach to window filtered by that pointerId. `resize(clientX)` returns "should it expand", synchronizing `open` accordingly. Lost capture, window blur, and unmount all run `finishActiveResize` — the comment notes capture may already be gone after window blur, so release wraps in try.

Keyboard resizing: left/right arrows step 8px (`KEYBOARD_RESIZE_STEP`), Home/End to min/max, each step immediately `finishResize()` (because finish is where persistence happens, below).

The width itself lives in [resizable-sidebar.tsx](../src/renderer/components/resizable-sidebar.tsx): `preferredWidth` is the user preference, read from `readUiState().sidebarWidth` (see [Desktop Client](./renderer-desktop-client.md)); `maxWidth = min(400, windowWidth / 3)`; the rendered width is the preference clamped to the current window — **narrow windows compress, wide windows restore, and the preference itself is never written**. `finishResize` writes the current width through `updateUiState`. Window resize sets a 150ms settling flag during which width tracks the pointer with no transition; clicking collapse/expand still animates after settling.

[mac-window-chrome.tsx](../src/renderer/pages/workbench/sidebar/mac-window-chrome.tsx) occupies the sidebar's top `app-region-drag` strip: a sidebar toggle plus history back/forward. The back/forward buttons' disabled state comes from `useCommandEnabled(commandId)` — it subscribes to the registry's version counter reading `registry.get(commandId)?.enabled`, so "can it go back" and whether the shortcut itself is available share one truth. Clicks call `dispatchCommand`, joining the keyboard at the same terminus (see [Shortcut System](./renderer-shortcuts.md)).

## Quick open

[quick-open/index.tsx](../src/renderer/pages/workbench/quick-open/index.tsx)'s `QuickOpenPanel` is the globally-mounted palette.

### Modes and prefixes

[quick-open-mode.ts](../src/renderer/pages/workbench/quick-open/quick-open-mode.ts) defines five modes: `default` plus four prefixed ones. **The query's first character decides the mode**; the rest is that mode's filter:

| Prefix | Mode | Command |
| --- | --- | --- |
| `~` | projects | `workbench.picker.project.open` |
| `#` | allSessions | `workbench.picker.allSessions.open` |
| `@` | projectSessions | `workbench.picker.session.open` |
| `:` | sentMessages | `workbench.picker.sentMessages.open` |

`QUICK_OPEN_MODE_ENTRIES` lists the four modes atop the default panel, each row's trailing hint being **that command's currently effective binding** — via `getEffectiveBindings(entry.commandId, catalog, overrides)[0]`, subscribed to the overrides store, so user rebinds update the hints. Selecting a row writes the prefix into the query and parks the cursor after it (`requestAnimationFrame` then `setSelectionRange`, because the value lands on the input only next tick).

Shortcuts open the panel directly with an `initialQuery` ([quick-open-store.ts](../src/renderer/pages/workbench/quick-open/quick-open-store.ts)'s `openQuickOpen(initialQuery)`); `openCount` resets the query on every open — including re-triggering while already open.

### Fuzzy scoring

[fuzzy-match.ts](../src/renderer/pages/workbench/quick-open/fuzzy-match.ts)'s `scoreFuzzyMatch(query, ...targets)` scores in five tiers: exact match 1000, prefix 800, word-boundary hit 600 minus a position penalty (capped at 150), substring 400 minus position, subsequence 100 plus continuity bonus. Across multiple targets, take the highest. An empty query or total miss returns null.

`WORD_POSITION_PENALTY_CAP`'s comment states why it exists: **a late word-boundary hit must still outrank any substring hit**.

The caller [rankByScore](../src/renderer/pages/workbench/quick-open/index.tsx) **keeps the original order** on an empty query (no sorting), otherwise filters and sorts descending by score; `toSorted` is stable, so ties keep their base order.

### Data sources

[use-quick-open-items.ts](../src/renderer/pages/workbench/quick-open/use-quick-open-items.ts) supplies three groups:

- **`useQuickOpenSessions()`**: all sessions from the workbench store, sorted by `compareSessions` then split into active/archived, deriving the project subset and the most recent 30 (`RECENT_SESSIONS_LIMIT`). In home mode, projectSessions degrades to everything (consistent with the history selector).
- **`useQuickOpenSentPrompts(open)`**: the current session's user messages, numbered by send order, `preview` cleaned by `previewText`. With the panel closed it returns a constant empty array — **to keep streaming updates on a stable reference**; the comment explains it subscribes to stable `messageIds`/`messages` references and derives in memo, and returning a fresh array straight from the selector would loop `useSyncExternalStore` forever. With no session selected, a module-level inert store stands in so callers need not conditionalize.
- Under DEV, mock-project sessions filter out via `HIDDEN_SESSION_PROJECT_IDS`.

### Content organization

The default mode with an empty query shows the mode rows + a recent-sessions group + a collapsed archived group; with a query it searches projects, sessions, and sent messages simultaneously, each grouped, archived still collapsed last. Other modes list only their own kind.

The archived collapsed group uses an ordinary row as its toggle (`data-archived-toggle`); expanded, it too passes through `rankByScore`. Empty-state copy switches per mode.

`SwitcherCommand` sets `shouldFilter={false}` — **filtering belongs entirely to the panel**, because ranking mixes projects, sessions, and messages across three kinds, and cmdk's built-in filtering cannot help. `defaultValue` points per mode at the current project or session so the initial highlight lands sensibly.

## Icons and emoji

Project icons belong to [project-icon-picker.tsx](../src/renderer/pages/workbench/components/project-icon-picker.tsx)'s `IconPicker`; the popover has two paths: emoji or a custom image.

Images use a `hidden` `<input type="file" accept="image/png,image/jpeg,image/webp">`; `projectIconDataUrlFromFile` processes it into `{type: 'custom', dataUrl}`; failures map through `ProjectImageErrorCode` to specific copy (png unavailable, too large, type unsupported, unreadable, processing unavailable). `isProcessingIcon` disables save while running — compressing large images is async.

One accommodation exists specifically for that hidden input: `suppressOutsidePressRef`. The input sits outside the popover's DOM, so its programmatic click reads as an "outside press" that would close the popover; that one close is cancelled via `details.cancel()`.

The emoji picker lives in [emoji-picker/](../src/renderer/pages/workbench/components/emoji-picker/).

[emoji-data.ts](../src/renderer/pages/workbench/components/emoji-picker/emoji-data.ts) processes `emojibase-data`'s compact dataset at module load: bucketing by `group`, sorting by `order`, each entry's keywords being **label + tags + shortcodes** concatenated and lowercased. **Group 2 (invisible components) is skipped**, so `EMOJI_GROUP_IDS` is `[0,1,3,4,5,6,7,8,9]`. The suggested group fixes eight entries by hexcode, reverse-looked-up from the dataset rather than hardcoding characters, guaranteeing consistency with the dataset.

[emoji-search.ts](../src/renderer/pages/workbench/components/emoji-picker/emoji-search.ts)'s `searchEmojis` is AND-semantics: the query splits on whitespace, and **every word must be a substring of the keywords**.

[emoji-picker.tsx](../src/renderer/pages/workbench/components/emoji-picker/emoji-picker.tsx)'s UI: a search box (a clear button appears on its right when a query exists) + a row of group tabs + the scroll area. Tab order is suggested plus the nine groups. Two details:

- **Scroll position reverse-maps the active tab**: `handleScroll` compares each section's `offsetTop - 8` (`SECTION_SPY_OFFSET`) against `scrollTop`, taking the last section still above. Skipped while searching.
- **Tab clicks are anchor jumps**: it sets a `pendingAnchor`, and an effect calls `scrollTo(offsetTop - 2)`; clearing the search also jumps back to the current tab's anchor. `max-h` must sit on the viewport — the root container is auto-height, and the viewport's `h-full` would resolve to auto, overflowing the grid.
