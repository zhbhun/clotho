# Spec Delta

## Purpose

Own the shared visual presentation of settings row lists: the card container, inset dividers between rows, row padding and densities, and row hover highlight — applied uniformly across all settings categories.

## ADDED Requirements

### Requirement: Settings row lists render as a shared card list

Settings pages that present a list of setting rows (preference rows, capability item lists, per-entry lists for projects, providers, and the permission mode radio group) SHALL render them inside a shared list container: a single rounded bordered card whose rows are stacked with no inter-row spacing. Individual pages SHALL NOT hand-write row containers (`divide-y` wrappers, per-row Cards) for these lists.

#### Scenario: Row list container

- **WHEN** any settings list described above renders more than one row
- **THEN** all rows appear inside one shared rounded bordered card with no gaps between rows

#### Scenario: No hand-written row separators

- **WHEN** a settings page renders its rows
- **THEN** the page code does not declare its own `divide-y` wrapper or per-row `Separator` elements; the shared list owns dividers

### Requirement: Inset dividers between rows

The shared list container SHALL separate adjacent rows with a horizontal divider that is inset from both ends of the card by the shared row horizontal padding — the divider's left edge aligns with the row title's left edge and its right edge mirrors that inset. The divider color SHALL be the in-card divider token, lighter than the card border token.

#### Scenario: Divider insets on both ends

- **WHEN** two rows are adjacent in a settings list
- **THEN** the divider between them starts and ends inset by the shared row horizontal padding, leaving the card's edge visible at both ends

#### Scenario: Divider color is the in-card token

- **WHEN** dividers render in the shared list (in either light or dark theme)
- **THEN** their color is the in-card divider token, not the card border token

### Requirement: Unified row padding and two row densities

The shared list SHALL define one horizontal row padding used by every row, so titles, descriptions, dividers, and controls align across all settings lists. Two vertical densities are allowed: a preference row (title plus description, taller) and a compact list row (shorter). Row titles SHALL use regular weight per the established settings typography convention.

#### Scenario: Horizontal alignment across lists

- **WHEN** two different settings lists are viewed side by side
- **THEN** their row content starts at the same distance from the card's left edge

#### Scenario: Density variants

- **WHEN** a preference row (with description) and a compact list row render in their lists
- **THEN** each uses its density's height while both share the same horizontal padding

### Requirement: Whole-row hover highlight

A row in the shared list MAY highlight its background when the pointer hovers over the row; when present, the highlight SHALL span the full row width inside the card (edge to edge, past the divider insets) and SHALL be supplied by the shared row so pages do not re-implement it.

#### Scenario: Hover spans the row

- **WHEN** the pointer hovers over a row in the shared list
- **THEN** the highlight covers the full row width inside the card, not only the text area
