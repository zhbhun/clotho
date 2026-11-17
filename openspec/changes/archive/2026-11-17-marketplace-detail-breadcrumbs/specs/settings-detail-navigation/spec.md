## MODIFIED Requirements

### Requirement: Breadcrumb bar on detail pages

While any detail page is open, the content region SHALL show a breadcrumb bar above the scrollable content, outside the centered content container, left-aligned with the title area and vertically centered within a window-draggable 40px header strip: the root entry is normally the category's localized name (clickable, returns to the list) followed by the current entry. Plugin and marketplace details opened from the Marketplace tabs SHALL use the originating tab's localized name as their root. The current entry text is provided by the detail page and is fixed at open time: the editor's localized action label — the edit label when editing an existing entry, or the create label (for example `New subagent`, `Add provider`) when creating. The breadcrumb bar SHALL NOT appear on list pages, and the breadcrumb leaf SHALL NOT follow keystrokes in the form.

#### Scenario: Breadcrumb shows category root and action label

- **WHEN** the user opens the detail page for the provider named `work`
- **THEN** the breadcrumb bar shows the root `模型` (clickable) followed by the localized edit label `编辑供应商`, matching the page's h1, and no category `h1` is shown above the detail content

#### Scenario: Breadcrumb leaf is fixed while editing

- **WHEN** the user renames the entry in the detail page's name field
- **THEN** the breadcrumb's current entry stays on the action label it showed at open, before and after typing
