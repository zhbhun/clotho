# Spec Delta

## Purpose

Owns what the OS-level window title shows for each workbench window state, so the macOS Window menu and task switcher can tell apart windows of the same project on different sessions.

## ADDED Requirements

### Requirement: Window title shows session and project segments

Every workbench window SHALL set its title to the selected session's display title and its project's display name joined as `会话 — 项目 — Clotho`. The session segment SHALL use the localized session display title (default titles included). A blank unsaved draft (the new-chat surface) SHALL NOT count as a selected session. When no session is selected, the title SHALL degrade to `项目 — Clotho`; when no project is bound (home), the title SHALL be `Clotho`.

#### Scenario: Session open in a project window

- **WHEN** a project window has a session selected
- **THEN** the window title is `<会话标题> — <项目名> — Clotho`

#### Scenario: No session selected

- **WHEN** a window shows a project with no selected session (new-chat empty state)
- **THEN** the window title is `<项目名> — Clotho`

#### Scenario: Home window

- **WHEN** a free window shows the home surface with no project bound
- **THEN** the window title is `Clotho`

### Requirement: Session title segment truncates, project segment does not

A session segment longer than 32 characters SHALL be truncated to the first 31 characters followed by `…`. The project segment SHALL always appear in full.

#### Scenario: Very long session title

- **WHEN** the selected session's display title exceeds 32 characters
- **THEN** the title's session segment is the first 31 characters followed by `…`, and the project segment is unchanged

### Requirement: Title follows session changes live

The window title SHALL update whenever the selected session changes, including tab switches, closing the selected session's tab, and renaming the selected session.

#### Scenario: Switching session tabs

- **WHEN** the user switches from one open session tab to another
- **THEN** the window title's session segment becomes the newly selected session's display title

#### Scenario: Renaming the selected session

- **WHEN** the user renames the currently selected session
- **THEN** the window title reflects the new name immediately

### Requirement: Window menu entries mirror window titles without the app suffix

The macOS Window menu SHALL label each open window with its native title minus the trailing ` — Clotho` suffix, so menu entries read `会话 — 项目` where the title reads `会话 — 项目 — Clotho`. A project window whose renderer has not yet set a real title SHALL show `…` as a placeholder. Each entry SHALL carry the session glyph as a template image so macOS tints it per appearance.

#### Scenario: Menu label after the renderer titles the window

- **WHEN** a window's renderer sets its title to `需要偏手绘风点… — Clotho`
- **THEN** the Window menu shows `需要偏手绘风点…` for that window without waiting for a focus change

#### Scenario: Menu label before the renderer loads

- **WHEN** a project window is created but its renderer has not set a title yet
- **THEN** its menu entry shows `…` until the real title arrives

### Requirement: Restored free windows reopen on their previous session

When a free window restores its persisted workspace at startup, the system SHALL select the workspace's active session (falling back to its last tab) when no session is selected yet, so the window shows — and titles itself by — the session it showed at last quit instead of a blank home draft.

#### Scenario: Relaunching a free window that had a session open

- **WHEN** the app relaunches and restores a free window whose persisted workspace has an active session
- **THEN** that session is selected immediately and the window title carries its name from launch
