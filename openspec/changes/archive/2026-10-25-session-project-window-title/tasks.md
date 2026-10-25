# Tasks

## 1. Title effect

- [x] 1.1 In `src/renderer/pages/workbench/hooks/use-projects.ts`, extend the document-title effect: build segments from `sessionDisplayTitle(selectedSession, t)` (session, truncated to 31 chars + `…` past 32) and `projectDisplayName(project)` (project, never truncated), join with ` — `, suffix `Clotho`; exclude blank unsaved drafts from the session segment; add `selectedSession` and `t` to deps. Verify: `npm run check` passes.

## 2. Tests

- [x] 2.2 Extend `use-projects.test.tsx` with a title case: render the hook with a selected session and bound project, assert `document.title` is `会话 — 项目 — Clotho`; assert degradation to `项目 — Clotho` with no session and to `Clotho` on home. Verify: `npx vitest run src/renderer/pages/workbench/hooks/use-projects.test.tsx`.

- [x] 2.3 Add a truncation case: session title longer than 32 characters yields a session segment of 31 chars + `…` with the project segment intact. Verify: same vitest run.

## 3. Window menu labels (found during live verification)

- [x] 3.1 `src/main/bootstrap.ts` `resolveWindows`: label each window by its native title minus the ` — Clotho` suffix (replacing the bare-project-name and `Clotho N` numbering logic); project windows show `…` until a real title lands. Verify: `npm run check`; live menu dump matches native titles.

- [x] 3.2 Add the `windowTitleChanged` RPC (contract in `src/shared/rpc.ts`, handler in `src/main/bootstrap.ts` rebuilding the menu, client in `src/renderer/services/claude/claude.ts`) and call it from the title effect — Electron's `page-title-updated` does not fire for later renderer title assignments. Verify: menu labels update after launch without focusing each window.

- [x] 3.3 Rasterize the session-tab glyph (Lucide `message-circle-code`) into `src/main/session-menu-icon.png` (28px @2x) and attach it as a 14pt template image to every Window-menu entry (`src/main/application-menu.ts`). Verify: live menu dump shows 14×14 template icons on every window entry.

## 4. Launch restore (found during live verification)

- [x] 4.1 `src/renderer/pages/workbench/services/workbench-persistence.ts` `restore()`: after laying down the persisted free-window ui, select the workspace's active session (fallback: last tab) when no session is selected, so the window reopens on its previous session and title. Verify: `npx vitest run src/renderer/pages/workbench/services/workbench-persistence.test.ts`; relaunch shows session titles immediately.

## 5. Integration check

- [x] 5.1 Manual: run `npm run debug`, relaunch with several windows open, switch session tabs and rename the selected session, confirm the macOS Window menu shows `会话 — 项目` per window from launch and updates on every change. Stop the app afterwards.
