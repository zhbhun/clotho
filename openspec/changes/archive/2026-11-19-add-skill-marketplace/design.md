# Design

## Context

MarketplaceSettings owns its tab selection. The separate Skills settings view reads user-level directories and symlinks through listAgentSkills. Forge copies selected runtime dependencies into its ASAR and disables RunAsNode.

## Goals / Non-Goals

Ship discovery and installation inside Settings using the desktop runtime. Project-scoped installation, automatic updates and hosting a registry are outside this change.

## Decisions

- Extend the Marketplace tab strip in the order Plugins, Skills, Marketplaces. Use the plugin catalog's responsive rows, localized controls and install feedback. Show the provider and install count without fetching per-result descriptions. Keep the rank selector and search field independent so clearing a query restores the previous view.
- Default to best-100. Parse the selected CSV by header, order by numeric rank, and atomically cache valid snapshots under Electron userData for six hours. Attribute LinklyAI/best-skills and show local sync time.
- Load the eight supported cross-platform charts individually from `data/latest/rankings/<chart>.csv`. Cache each independently. Display the reported metric, preserve each platform’s units, and enable installation only for skill rows with a skills.sh source.
- Expose typed ranking, search and single-install operations through shared RPC, preload and the existing renderer client. Bundle a pinned skills package with its bin and dist entries via Forge. Resolve its CLI entry in main and run it in a Node worker hosted by an Electron utility process after app readiness. The worker exits when the unmodified CLI finishes, and its host flushes the output before exiting. This avoids a system Node/npm prerequisite and works with the existing fuse policy. Verify in the packaged application.
- Run find with the trimmed query as data, prevent flag interpretation, debounce input, discard stale completions, and preserve CLI result order. Decode the pinned version's noninteractive output into source, skill selector, and displayed count. Preserve approximate counts as supplied. A CLI-reported empty result can also represent an upstream outage in 1.8.1. Use neutral empty-state copy and surface detectable execution or format failures.
- Run the bundled add command against an isolated staging directory with the exact skill selector, global Claude Code scope, and copy mode. Validate the single repository result using JSON, or the isolated CLI lock entry for HTTPS well-known providers. Verify SKILL.md, record provenance, then publish the directory by rename. Mount the existing local Skills list on selection so opening it reads the new inventory. Coalesce concurrent installs targeting the same directory. For an occupied name with unknown or conflicting provenance, offer the local skill management menu. Open reads the local skill detail, and Uninstall uses the existing confirmation and removes the user-level installation. Use source and selector for remote result identity.

## Risks / Trade-offs

- The snapshot can be older than its sync time. Keep a last-known-good copy and keep search available on a cold fetch failure.
- CLI search text can change between versions. Pin the package and keep a representative output fixture that includes punctuation and compact install counts.
- A source may disappear or rename a skill between ranking and installation. Surface the CLI failure and preserve the user's place in the catalog.
