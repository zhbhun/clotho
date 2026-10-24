# Spec Delta

## Purpose

Owns what the conversation header shows per window state: the always-present project, branch, and history controls, session tabs between them, and the absence of a composer-attached control strip.

## ADDED Requirements

### Requirement: Conversation header always carries the project, branch, and history controls

The conversation header SHALL always render the project switcher, branch switcher, and history button, regardless of whether session tabs are open. With no tabs open, the controls SHALL sit at the header edges — the project switcher on the left, the branch switcher and history button on the right — with the empty tab region between them.

#### Scenario: Controls stay in the header on a new-chat draft

- **WHEN** a window has no open session tabs and the blank new-chat draft is selected
- **THEN** the project switcher, branch switcher, and history button remain in the header at their usual edge positions
- **AND** no project or history control appears on or above the composer

#### Scenario: Controls keep their place as tabs open and close

- **WHEN** the first session tab opens, or the last session tab closes
- **THEN** the project switcher, branch switcher, and history button stay in the header without moving between the header and the composer area

### Requirement: No composer-attached control strip

The new-chat empty state SHALL NOT render a control strip above the composer; the surface carries only the centered brand mark, slogan, and the composer.

#### Scenario: Empty state has no strip

- **WHEN** the new-chat empty state is shown
- **THEN** no project switcher, branch switcher, or history button is rendered between the brand mark and the composer
