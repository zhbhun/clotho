# Design

## Context

The catalog is already ordered by install count before search filtering, and its source filter runs independently.

## Goals / Non-Goals

**Goals:** Rank matches without changing the default order or source filtering.

**Non-Goals:** Change catalog data, search fields, UI layout, or pagination.

## Decisions

Partition the existing sorted entries into exact, prefix, substring, and description/marketplace match groups, preserving their existing order within each group. Empty search returns the sorted entries unchanged. This avoids re-sorting the full catalog on every keystroke.

## Risks / Trade-offs

Unknown install counts remain after known counts within a match group, while relevance always takes precedence between groups.
