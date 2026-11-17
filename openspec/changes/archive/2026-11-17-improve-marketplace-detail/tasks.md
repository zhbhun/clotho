# Tasks

## 1. Marketplace metadata

- [x] 1.1 Extract optional `owner.name` alongside description from the local manifest and update the shared marketplace response; verify valid, absent, and invalid owners plus existing description behavior with focused main-process tests.

## 2. Marketplace detail

- [x] 2.1 Build the approved detail identity, description, borderless plugin section and Info section, including an aligned loading state; verify available/missing owner and description, source formatting, plugin counts, and marketplace filtering with focused renderer tests.
- [x] 2.2 Move Refresh and Uninstall marketplace into the overflow menu while preserving refresh and confirmed removal; verify both actions and cancellation with focused tests.
- [x] 2.3 Replace per-plugin Install text with a `+` icon action and reconcile successful installed state without stale requests undoing it; verify success, failure, and already-installed cases with focused tests.

## 3. Verification

- [x] 3.1 Run `npm run check`, affected-module tests, and changed-file ESLint and Prettier checks; validate the OpenSpec change and inspect the detail through the project's debug workflow if available.

## Workflow follow-up

- After user review, sync specs and archive the completed change together with the prototype.
