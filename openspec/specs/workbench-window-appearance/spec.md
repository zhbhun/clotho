# workbench-window-appearance Specification

## Purpose

Owns the native background color of main windows: every main window is created with a themed `backgroundColor` so the window compositor never samples Electron's default white, at first paint or at teardown.

## Requirements

### Requirement: Main windows are created with a themed background color
The system SHALL create every main window with its native background color set to the persisted appearance palette's background for the resolved theme (direct theme, or the system theme when the preference is `system`).

#### Scenario: Dark theme window background
- **WHEN** the app preference is theme `dark` with palette background `#1e1e1e`
- **THEN** a new main window's native background color is `#1e1e1e`

#### Scenario: System theme follows the OS appearance
- **WHEN** the app preference is theme `system` and the OS reports a dark appearance
- **THEN** a new main window's native background color is the dark palette's background

#### Scenario: Light theme window background
- **WHEN** the app preference is theme `light` with palette background `#ffffff`
- **THEN** a new main window's native background color is `#ffffff`

### Requirement: Window teardown paints the themed background
The system SHALL ensure that when a main window closes, the window's final composited frames use the themed native background color rather than a default white, so no white flash appears during window close.

#### Scenario: Closing a free window shows no white flash
- **WHEN** the user closes a free window
- **THEN** the window's frames during teardown composite over the themed background color, never over default white

#### Scenario: Closing a project window shows no white flash
- **WHEN** the user closes a project window
- **THEN** the window's frames during teardown composite over the themed background color, never over default white
