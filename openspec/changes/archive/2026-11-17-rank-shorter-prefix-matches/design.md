# Design

## Context

Search partitions an already ordered catalog into match groups.

## Goals / Non-Goals

**Goals:** Prefer closer name prefixes while preserving popularity as a tie-breaker.

**Non-Goals:** Change exact matches, substring matches, source filters, or default ordering.

## Decisions

Sort the prefix group by name length with a stable sort, preserving the preexisting popularity order when lengths are equal.

## Risks / Trade-offs

Shorter prefix names can precede more popular longer names, as requested.
