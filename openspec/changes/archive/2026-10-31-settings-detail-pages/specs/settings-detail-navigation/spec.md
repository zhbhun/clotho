# Spec Delta

## Purpose

Define how the settings page's second-level detail pages behave: the shared detail-view state, the breadcrumb bar above the content pane, the unsaved-changes guard on list-bound navigation, and which editors open as detail pages instead of dialogs or inline blocks. The settings page keeps a single content pane; a detail page replaces the category's list within it.

## ADDED Requirements

### Requirement: Shared detail-view state across settings categories

The settings page SHALL maintain one detail view shared by all categories: at most one detail page is open at a time, identified by its category together with the entry being edited (or none when creating). Opening a detail page in any way — an Add action, a row edit action — SHALL switch the content pane from that category's list to its detail page, and every leave path (save, cancel, breadcrumb navigation, opening another entry) SHALL return to the list state. While a detail page is open, the category's list page SHALL NOT remain mounted beneath it.

#### Scenario: Opening a detail page switches the pane

- **WHEN** the user activates a row's edit action or a category's Add action in any convertible editor (providers, projects, subagents, hooks, MCP servers, workflows)
- **THEN** the content pane switches from the category's list to that entry's detail page and the category header is replaced by the breadcrumb bar

#### Scenario: Saving returns to the list

- **WHEN** the user saves from a detail page
- **THEN** the content pane switches back to the category's list, which reflects the saved change

### Requirement: Breadcrumb bar on detail pages

While any detail page is open, the content region SHALL show a breadcrumb bar above the scrollable content, outside the centered content container, left-aligned with the title area and vertically centered within a window-draggable 40px header strip: the root entry is the category's localized name (clickable, returns to the list) followed by the current entry. The current entry text is provided by the detail page and is fixed at open time: the editor's localized action label — the edit label when editing an existing entry, or the create label (for example `New subagent`, `Add provider`) when creating. The breadcrumb bar SHALL NOT appear on list pages, and the breadcrumb leaf SHALL NOT follow keystrokes in the form.

#### Scenario: Breadcrumb shows category root and action label

- **WHEN** the user opens the detail page for the provider named `work`
- **THEN** the breadcrumb bar shows the root `模型` (clickable) followed by the localized edit label `编辑供应商`, matching the page's h1, and no category `h1` is shown above the detail content

#### Scenario: Breadcrumb leaf is fixed while editing

- **WHEN** the user renames the entry in the detail page's name field
- **THEN** the breadcrumb's current entry stays on the action label it showed at open, before and after typing

### Requirement: Unsaved-changes guard on list-bound navigation

Every detail page SHALL track whether its form has unsaved changes. When it does, list-bound navigation — clicking the breadcrumb root, clicking a sidebar category, or clicking Cancel — SHALL open a confirmation dialog before leaving; confirming discards the changes and returns to the list, declining keeps editing. When the form has no unsaved changes, those paths return to the list directly. Saving always returns to the list. The Esc key and the sidebar's Back action keep their existing behavior of closing the entire settings page without this confirmation. The dialog copy identifies the entry being discarded (its name or the create label).

#### Scenario: Dirty detail page confirms before leaving

- **WHEN** the user edits a field on the MCP detail page and clicks the breadcrumb root
- **THEN** a confirmation dialog opens naming the entry; confirming discards the edits and returns to the list, declining keeps editing

#### Scenario: Clean detail page leaves directly

- **WHEN** the user opens the workflow detail page, changes nothing, and clicks a sidebar category
- **THEN** the pane returns to the list without any dialog

#### Scenario: Esc closes the settings page without confirming

- **WHEN** the user presses Esc while a dirty detail page is open
- **THEN** the whole settings page closes without a discard confirmation

### Requirement: Detail pages present a uniform page structure

Each detail page SHALL present: an h1 title matching the breadcrumb leaf, a localized description line below it, the editor's form, and a footer row right-aligning Cancel and Save (Save the primary action); where the editor supports deletion, a danger-styled Delete button sits at the footer's left end. Dialogs SHALL NOT be used for opening these editors from the settings page; deletion confirmation alerts and the workbench sidebar's add-project dialog are unaffected.

#### Scenario: Hook detail page structure

- **WHEN** the user opens the hook detail page to create a hook
- **THEN** the page shows the h1 `新建 Hook`, a description line, the event/matcher/commands form, and a footer with Cancel and Save right-aligned, with no Delete button

### Requirement: Detail pages align with the content column

While a detail page is open, the breadcrumb bar and content padding SHALL reserve the list view's title area so the detail page's h1 occupies the same position (top and left edges) as the list page's category header — no vertical jump when entering or leaving a detail page. The detail body renders as a bare column aligned with the h1 and footer, without an enclosing card.

#### Scenario: No jump between list and detail

- **WHEN** the user opens a detail page and then returns to the list
- **THEN** the category header and the detail page's h1 sit at the same top offset, and no layout shift occurs

#### Scenario: Workbench add-project dialog is unaffected

- **WHEN** the user activates the workbench sidebar's add-project action
- **THEN** the project dialog opens as before, sharing the same form body as the settings page's project detail page
