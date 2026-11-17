# Design

## Context

The CLI already returns a source `path`, but the main-process mapping and shared RPC type omit it. The detail and list render the source separately.

## Goals / Non-Goals

**Goals:** Preserve and show the source path consistently without changing marketplace management.

**Non-Goals:** Read marketplace descriptions or change how local paths are resolved.

## Decisions

Add optional `path` to the source contract, preserve the CLI value, and include it after repo and URL in the existing source rendering. Retain the existing source-type fallback. The prototype checks the existing layout with and without a path.

## Risks / Trade-offs

- A CLI may omit `path` → preserve the current fallback rather than guessing from the install location.
