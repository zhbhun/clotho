# Tasks

## 1. Marketplace navigation and tabs

- [x] 1.1 Add the localized Marketplace sidebar category immediately above Plugins, route the Plugins upper-right action to it, and verify sidebar ordering, selected category, and default Plugins tab in affected settings tests.
- [x] 1.2 Compose centered default-variant shadcn Tabs without a page title, reuse the catalog and marketplace list as their panels, and verify tab switching and existing catalog/source actions with focused settings tests.

## 2. Detail navigation and validation

- [x] 2.1 Move catalog and marketplace detail/add navigation under Marketplace while preserving tab restoration and the unsaved-changes guard; verify breadcrumb returns and dirty-form confirmation using affected tests.
- [x] 2.2 Verify the affected tests, `npm run check`, and ESLint and Prettier checks on changed files; address regressions before completing this task.

## Workflow follow-up

- Archive the completed change and its prototype after verification.
