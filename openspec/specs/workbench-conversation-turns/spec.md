# workbench-conversation-turns Specification

## Purpose

Owns per-turn presentation in the conversation timeline: the status header (Working-for / Worked-for / Stopped / Failed), its default expansion, and what stays visible when a turn's work timeline is collapsed.

## Requirements

### Requirement: Status header expansion defaults follow turn state

While a turn streams, or when the turn ended interrupted or failed, the status header SHALL default to expanded. When a turn has completed successfully, the header SHALL default to collapsed. An explicit user toggle on a turn SHALL override the default and persist for the session.

#### Scenario: Turn stays expanded while streaming

- **WHEN** the latest turn is streaming its work timeline
- **THEN** the status header is expanded by default and tool runs are visible

#### Scenario: Successful turn collapses automatically

- **WHEN** a turn finishes with a successful result (no failure, no interruption)
- **THEN** the status header defaults to collapsed
- **AND** the header shows the Worked-for label with the collapsed work summary

#### Scenario: Failed turn stays expanded

- **WHEN** a turn ends with a failure
- **THEN** the status header defaults to expanded and the error card stays visible

#### Scenario: Interrupted turn stays expanded

- **WHEN** a turn ends interrupted
- **THEN** the status header defaults to expanded and the Stopped-after state stays visible

#### Scenario: User toggle overrides the default

- **WHEN** the user manually expands or collapses a turn's status header
- **THEN** that choice takes precedence over the state-based default for the rest of the session
