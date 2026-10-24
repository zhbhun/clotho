# Tasks

## 1. Implementation

- [x] 1.1 In `src/main/window-options.ts`, resolve the theme (`nativeTheme.shouldUseDarkColors` for `system`) and set `options.backgroundColor = themePalettes[resolved].background`
- [x] 1.2 Update `src/main/window-options.test.ts`: cover dark / light / system-resolved-via-nativeTheme background color in the built options

## 2. Verification

- [x] 2.1 Run affected tests: `npx vitest run src/main/window-options.test.ts`
- [x] 2.2 `npm run check` (TypeScript) passes
- [x] 2.3 Manual check via `npm run debug`: close a free window and a project window in dark theme — no white flash
