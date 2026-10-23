# workbench-sidebar Specification

## Purpose

Defines which sessions the workbench sidebar lists per window kind: free windows switch between open/pinned sessions and full project history via tabs, project windows show history directly, and the toolbar above the list carries locate and back-to-top actions.

## Requirements

### Requirement: Free window sidebar keeps the current/history switch
A free window's sidebar SHALL keep the current/history tab switch. The current tab SHALL list sessions open in any workspace tab plus pinned sessions; the history tab SHALL list all known sessions on the date timeline. Sidebar rows on the current tab SHALL offer a close action that closes the session's open tab.

#### Scenario: Switching tabs in a free window
- **WHEN** the user clicks the history tab in a free window's sidebar
- **THEN** the list shows the full session timeline including sessions with no open tab

#### Scenario: Closing from the current tab
- **WHEN** the user invokes close on a row of the current tab
- **THEN** the session's open tab closes and the session disappears from the current list

### Requirement: Project window sidebar shows history directly
A project window's sidebar SHALL list the full session history of its bound project on the date timeline, without a current/history tab switcher. Pinned sessions SHALL appear through the timeline's pinned group.

#### Scenario: Sidebar content in a project window
- **WHEN** a project window renders its sidebar
- **THEN** no current/history switcher is shown and the list shows the bound project's full history, including sessions with no open tab

#### Scenario: Free window keeps the switcher
- **WHEN** a free window renders its sidebar
- **THEN** the current/history switcher is shown as before

### Requirement: Project window list pins group headers and floats the list actions
A project window's sidebar SHALL have no toolbar row between the new-chat button and the list. Date group headers SHALL stick to the top of the list while their group is in view, and the locate-current-session and back-to-top actions SHALL float at the list's top-right on the same row as the pinned header, staying readable above passing rows.

#### Scenario: Locating the current session from history
- **WHEN** the user activates locate-current-session in a project window
- **THEN** the list scrolls to the currently selected session if it is in the list

### Requirement: Project window sidebar rows have no close action
A project window's sidebar rows SHALL NOT offer a close action; closing an open session's tab happens through the header tab bar.

#### Scenario: Row actions in a project window
- **WHEN** the user opens a session row's actions in a project window
- **THEN** no close action is available

### Requirement: Blank drafts stay out of the project window sidebar
A project window's sidebar SHALL NOT list unsaved blank draft sessions; the new-session draft remains visible only in the main area and the header tab bar once it becomes a stored draft.

#### Scenario: New session draft in a project window
- **WHEN** the user starts a new session in a project window and has not sent content
- **THEN** the sidebar history list is unchanged and shows no entry for the draft
