# Tasks

## 1. Removal logic

- [x] 1.1 In the `closed` handler in `app-windows.ts`, loosen the removal condition from `closed?.kind === 'project' && !isQuitting` to `!isQuitting` so free and project windows share `withoutWindowEntry`; generalize the adjacent project-window comment accordingly. Verify: `npm run check` passes.

## 2. Tests

- [x] 2.1 Re-check that `window-state.test.ts` already asserts `withoutWindowEntry` drops free entries (the pure function is covered; if so, record the confirmation instead of duplicating coverage). Verify: `npx vitest run src/main/window-state.test.ts` passes.

## 3. Integration verification

- [x] 3.1 Verify via `npm run debug` + CDP: open 2 free windows, close 1, quit and relaunch — only 1 is restored and its storage entry is gone. Verify: window count after relaunch matches the set open at quit, and `openedWindows` in `~/.clotho/storage.json` maps 1:1 to those windows.
