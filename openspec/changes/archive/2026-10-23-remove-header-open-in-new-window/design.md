# Design

## Context

`session/header.tsx` renders the pop-out button at the header's top-right, gated by `canOpenInNewWindow` (`windowKind === 'free' && projectMode === 'project' && selectedProject` non-home && handler present). Inside the same file the `onOpenProjectInNewWindow` prop has **two** consumers: the corner button and `ProjectSwitcherButton` (whose menu offers the same action per project). `header.test.tsx` has one test clicking the corner button and one asserting its absence inside a project window.

## Goals / Non-Goals

**Goals:**
- Remove the header corner pop-out button and its `canOpenInNewWindow` gate.
- Keep the header compiling and its remaining tests green.

**Non-Goals:**
- Touching the project switcher menu item, project-list row action, quick-open action, empty-state entry, or the `claude.openProjectWindow` IPC.

## Decisions

- **Keep the `onOpenProjectInNewWindow` prop on the header.** It feeds `ProjectSwitcherButton`; only the corner button block goes. Alternative (removing the prop entirely) breaks the switcher menu.
- **Remove now-dead code with the block**: `canOpenInNewWindow`, and the `ExternalLink` / `Tooltip*` imports if nothing else in the file uses them (ESLint confirms).
- **Tests**: delete "pops the shown project out to a new window from the header corner button"; in "offers neither exit nor pop-out inside a project window" keep the exit assertion and drop the pop-out query. `renderHeader`'s `onOpenProjectInNewWindow` mock stays — the switcher menu still consumes it.

## Risks / Trade-offs

- [Discoverability: the header loses its always-visible pop-out entry] → accepted by user request; switcher menu and row action remain.
- [Unused-import lint errors after the edit] → run ESLint on changed files.

## Open Questions

(none)
