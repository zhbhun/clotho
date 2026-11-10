# Tasks

## 1. Shared catalog state

- [x] 1.1 Add renderer-lifetime catalog and installed-result snapshots with distinct missing and empty states; verify independent success, failure, and empty-result behavior with focused tests.
- [x] 1.2 Implement revalidation, request generation guards, and retry behavior; verify delayed older responses cannot replace newer results or mutation effects.

## 2. Marketplace navigation and operations

- [x] 2.1 Connect the catalog page to shared snapshots and revalidate on entry; verify first-load spinner, immediate repeat visits, external changes, failed refresh retention, and preserved tab navigation with focused component tests.
- [x] 2.2 Reconcile or invalidate snapshots after successful plugin and marketplace operations across settings pages; verify install, uninstall, enable, disable, add, remove, and refresh paths and failed operations with focused tests.

## 3. Integration verification

- [x] 3.1 Run affected tests, `npm run check`, and ESLint and Prettier checks on changed files; verify catalog navigation and mutation behavior using the project's debug workflow when needed.

## Workflow follow-up

- Archive the change after implementation and verification.
