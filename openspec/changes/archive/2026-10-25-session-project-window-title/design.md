# Design

## Context

Windows title themselves via `document.title` in the workbench title effect (`src/renderer/pages/workbench/hooks/use-projects.ts`); macOS uses `hiddenInset`, so this title surfaces natively (Dock hover, Mission Control, app switcher). The hook scope already holds everything needed: `selectedSession`, `projectMap`, `windowKind`, `pinnedProjectId`, and the translator `t`.

The original plan assumed the Window menu reads the title directly. Live verification disproved that: the menu is built in the main process from a separate label pipeline (`resolveWindows` in `src/main/bootstrap.ts`), so the title and the menu are two layers that each need their own wiring.

## Goals / Non-Goals

**Goals:**
- Title shows `会话 — 项目 — Clotho`; the Window menu shows the same without the app suffix.
- Menu labels follow title changes without a focus round-trip.
- Restored windows reopen on their previous session immediately, so the title is right from launch.

**Non-Goals:**
- Truncating the project segment.
- Truncating session titles anywhere else (sidebar, tabs keep their own CSS truncation).
- Main-process `setTitle` — the renderer keeps owning the title.

## Decisions

- **Build in the existing effect, not a new hook.** The segments derive from state already in scope; a separate `use-window-title` hook would re-subscribe to the same data. Deps gain `selectedSession` and `t`.
- **`sessionDisplayTitle` over `sessionTitle`** (`../utils/session-list`): default `Session xxxxxxxx` titles render localized ("新对话"), matching the sidebar and tabs.
- **Truncate at 32 chars (31 + `…`), session segment only.** VS Code uses a similar cap for window titles. The project segment stays whole — it is the field users distinguish windows by when sessions overflow. Plain string slice; CJK chars count as 1, consistent with the menu's own overflow behavior.
- **Blank unsaved drafts are excluded from the session segment.** The new-chat surface is not a session to name; without this, the home window would title `新对话 — Clotho`.
- **Menu label = native title minus the ` — Clotho` suffix** (`resolveWindows`). The old logic replaced labels wholesale (bare project name for project windows, forced `Clotho N` numbering for free windows), which is what the first screenshot showed. Before a window's renderer has loaded, the strip is a no-op, so project windows show `…` until the real title lands; same-named windows get macOS' automatic numbering.
- **`windowTitleChanged` RPC nudges menu rebuilds.** Electron's `page-title-updated` fires for the initial document only — later renderer `document.title` assignments never reach the main process (verified live: JS-assigned titles changed `getTitle()` but no event fired). The title effect therefore notifies the main process after each assignment, and the handler rebuilds the application menu. The `page-title-updated` listener stays for the initial load.
- **Menu icon: pre-rendered png imported through Vite.** The session-tab glyph (Lucide `message-circle-code`) is rasterized once into `src/main/session-menu-icon.png` (28px = 14pt @2x, original viewBox); Vite inlines it as a data URL, `nativeImage.addRepresentation({scaleFactor: 2})` presents it at 16pt logical, and `setTemplateImage` lets macOS tint it per appearance. Every window entry carries the icon so labels align.
- **Free-window restore selects the restored workspace's active session** (`workbench-persistence.ts restore()`). The persisted ui carries only tabs/active maps, not `currentSessionId`; without this, the window opened as a home blank draft (`Clotho` title) until a focus-triggered refresh fixed it.

## Risks / Trade-offs

- [Character-count slice splits surrogate pairs] → Session titles come from user input and Claude-generated names; use `Array.from` if a split ever surfaces, otherwise the plain slice stays.
- [Title churn on rapid tab switching] → A string assignment plus one cheap RPC per change; the menu rebuild is debounced by its seq guard.
- [Renderer misses the notify call (e.g. crash mid-effect)] → Menu falls back to the stale label; focus or any window lifecycle event rebuilds it.
