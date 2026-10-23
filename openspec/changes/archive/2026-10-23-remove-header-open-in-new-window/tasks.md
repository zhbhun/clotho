# Tasks

## 1. Remove the header pop-out button

- [x] 1.1 In `src/renderer/pages/workbench/session/header.tsx`, delete the corner button block (`canOpenInNewWindow` ? Tooltip… : null, ~lines 79-86 and 151-170), keeping the `onOpenProjectInNewWindow` prop and its `ProjectSwitcherButton` usage.
- [x] 1.2 Remove imports left unused by 1.1 (`ExternalLink`, `Tooltip*`) once nothing else in the file references them.

## 2. Update tests

- [x] 2.1 In `src/renderer/pages/workbench/session/header.test.tsx`, delete the "pops the shown project out to a new window from the header corner button" test.
- [x] 2.2 In "offers neither exit nor pop-out inside a project window", drop the pop-out query assertion and keep the exit one.

## 3. Verify

- [x] 3.1 `npx vitest run src/renderer/pages/workbench/session/header.test.tsx`
- [x] 3.2 `npm run check`; ESLint + Prettier on the two changed files.
