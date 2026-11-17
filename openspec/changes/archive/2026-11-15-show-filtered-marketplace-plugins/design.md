# Design

## Context

The catalog is deduplicated globally before the source filter and the filter options are derived from that result.

## Goals / Non-Goals

**Goals:** Show entries in their chosen source and retain the unified view.

**Non-Goals:** Change catalog RPCs or the overall page layout.

## Decisions

Derive source options from raw entries. Filter raw entries by source before deduplication; with All selected retain existing global precedence. In a selected source, use exact plugin IDs for installed state and operations so a same-name installation from another source is not targeted.

## Risks / Trade-offs

Same-name plugins can be installed separately; exact identity prevents operations from affecting another source.
