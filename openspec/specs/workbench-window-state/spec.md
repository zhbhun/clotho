# workbench-window-state Specification

## Purpose

Owns the lifecycle of per-window persisted state (`windowsState.openedWindows`): when entries are written, when a window close removes them, and when they survive across launches, so the windows restored at startup match those actually open at last quit.

## Requirements

### Requirement: Closing a free window removes its persisted entry
When the user closes a free window outside the quit flow, the system SHALL remove that window's entry from the persisted `openedWindows` so it no longer appears in the next launch's restore set.

#### Scenario: Manually closing one free window
- **WHEN** the app has multiple free windows open and the user closes one while the app keeps running
- **THEN** that window's entry is removed from `openedWindows` and the other entries are untouched

#### Scenario: Closing every free window (macOS resident app)
- **WHEN** the user closes all free windows one by one while the app keeps running (macOS)
- **THEN** `openedWindows` holds no free entries

### Requirement: Launching with no stored window entries opens a fresh free window
When startup finds no window entries to restore, the system SHALL open one new free window with a fresh identity and a default centered frame instead of starting with no window.

#### Scenario: Launch after closing every window
- **WHEN** the app launches with `openedWindows` holding no entries
- **THEN** one new free window opens, centered at the default size, and it does not reuse any removed window's entry

#### Scenario: First launch with no stored state
- **WHEN** the app launches with no persisted `windowsState` at all
- **THEN** one new free window opens, centered at the default size

### Requirement: Windows open at quit are kept for restore
When the app quits, the system SHALL keep the entries of the windows open at that moment so they are restored on the next launch.

#### Scenario: Quitting with free windows open
- **WHEN** the user quits the app while free windows are open
- **THEN** those windows' entries stay in `openedWindows`, all of them are restored on the next launch, and the last active one ends up focused

### Requirement: Closing a project window removes its persisted entry
When the user closes a project window outside the quit flow, the system SHALL remove that window's entry from `openedWindows` while the project's workspace state stays in `projectState` for the project's next opening.

#### Scenario: Manually closing a project window
- **WHEN** the user closes a project window while the app is not quitting
- **THEN** the window entry is removed from `openedWindows` and the project's record in `projectState` is untouched
