# Design

## Context

`InstallPluginPage` owns ephemeral catalog and installed state and is unmounted during category and detail navigation. Each mount invokes two independent CLI-backed RPCs. Catalog results determine the spinner, while installed records determine deduplication and actions. The existing CLI-backed management contract and default tab behavior remain in force.

## Goals / Non-Goals

**Goals:** Preserve successful results across navigation, revalidate on visits, and keep mutation and in-flight request ordering correct.

**Non-Goals:** Persist data across application restarts, change the CLI or RPC contract, eliminate first-load latency, add periodic polling, or redesign the page.

## Decisions

- Use a renderer-lifetime shared settings store or equivalent cache, separate from the mounted page, with independently nullable catalog and installed snapshots. A successful empty array is distinct from no result. A component-only cache would be lost on unmount; disk persistence adds stale-start complexity outside the goal.
- On entering the catalog, render snapshots immediately and start independent revalidation requests. Only a missing catalog blocks on a spinner; failed requests preserve existing snapshots and surface an error. Retrying on the next visit detects external CLI changes without background polling.
- Route successful management operations through shared cache reconciliation/invalidation, including actions in installed-plugin and detail pages. Apply known plugin state immediately, then re-read affected records; marketplace add/remove/update revalidates the catalog and installed records as appropriate. Failed operations do not commit their intended changes. The CLI remains authoritative.
- Track request generations per data set. Increment the generation upon invalidation or mutation, ignore results from older generations, and ensure a fresh request follows any invalidation even if an older request is still running. Coalesce only requests from the same valid generation. This avoids stale responses undoing changes; merely retaining mounted components does not solve the race.
- Keep view-specific filters, pagination, and default-tab reset behavior local. Returning from details can recreate the view without losing cached data.

## Risks / Trade-offs

- [External changes are briefly stale] → Revalidate on each visit; no claim of live synchronization.
- [Concurrent operations and responses may disagree] → Guard each snapshot with generations and test delayed responses and mutation races.
- [Partial request failure] → Preserve each last successful snapshot independently and retry on a later visit; avoid interpreting a failed installed-list request as an empty list.
- [Cached data persists until renderer exit] → Store only existing catalog metadata and installed records in memory; restart clears it.

## Migration Plan

No data migration is needed. Reverting restores per-visit loads; the in-memory snapshots disappear when the renderer exits.
