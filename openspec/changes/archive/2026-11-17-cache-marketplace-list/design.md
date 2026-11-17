# Design

## Context

The list and detail currently share a local hook that waits for marketplace and catalog requests together. The catalog already has a renderer-lifetime Zustand cache and revalidates on visits.

## Goals / Non-Goals

**Goals:** Provide immediate repeat visits, background revalidation, and correct ordering of asynchronous responses.

**Non-Goals:** Persist results across renderer restarts or alter the CLI/IPC contract.

## Decisions

Keep the registered marketplaces in the existing catalog cache, with a separate request generation and error state. The list page requests only marketplaces; the detail retains its existing independent data loading. Marketplace operations trigger revalidation and invalidate older list responses. Removing an entry also removes it immediately from cached data. Compared with component-local state, this survives navigation; unlike persistent storage it cannot outlive the renderer.

The prototype models first load, cached return, empty results, and failure. It confirms that a null sentinel distinguishes no result from an empty list.

## Risks / Trade-offs

- Cached information may be briefly stale → revalidate on each visit and after operations.
- Concurrent requests may finish out of order → apply only the latest generation.
