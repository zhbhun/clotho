# Design

## Context

The catalog currently collapses entries by name before displaying the All view.

## Goals / Non-Goals

**Goals:** Show both marketplace entries and manage each exact ID.

**Non-Goals:** Change the CLI or the catalog page layout.

## Decisions

Use the full plugin ID to distinguish entries and installed state in all views. Remove name-based merging; retain source filtering and catalog ordering.

## Risks / Trade-offs

Similar entries appear more than once; the existing source label identifies each one.
