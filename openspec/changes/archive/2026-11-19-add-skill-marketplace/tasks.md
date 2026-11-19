# Tasks

## 1. Desktop data and bundled runtime

- [x] 1.1 Add typed rank, search and install operations to shared RPC, main, preload and renderer clients including mock support.
- [x] 1.2 Read the selected chart CSV in main, parse rows by rank, cache valid results across launches and handle offline or invalid responses.
- [x] 1.3 Pin skills and package its runtime entry points with Forge. Run noninteractive find in a utility process and adapt results and detectable errors.
- [x] 1.4 Install the exact selected skill for user-level Claude Code, handle collisions and repeated clicks, and reconcile success with the local Skills inventory.

## 2. Marketplace experience

- [x] 2.1 Add the localized Skills tab with ranking selection, attribution, sync status, and cached, loading and unavailable states.
- [x] 2.2 Connect search and installation in both catalog modes. Preserve ranking selection, discard stale results, and refresh installed state after success.

## 3. Verification

- [x] 3.1 Run focused checks for quoted CSV fields, numeric ranking, invalid refresh fallback, off-list CLI results, stale searches, duplicate names and installation failures.
- [x] 3.2 Run TypeScript checks, changed-file lint and formatting, affected tests, and npm run package. Exercise the packaged CLI without a system Node or npx on PATH.
- [x] 3.3 Verify the settings flow in Electron via the repository debug/CDP workflow with an isolated Claude home. Install one skill from a multi-skill repository and confirm only that skill appears in user-level Skills across projects.

- [x] 3.4 Verify the collision menu opens local skill details and restores installation after confirmed uninstall.

- [x] 3.5 Integrate the eight supported charts and verify their rank order, metrics, and browse-only aggregate rows.
