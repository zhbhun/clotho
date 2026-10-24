# Design

## Context

`createMainWindowOptions` (`src/main/window-options.ts`) builds every main window's `BrowserWindow` options and already receives `AppAppearancePreferences`, but never sets `backgroundColor`. Electron's default is white; the window is created `show: false` and revealed on `ready-to-show`, so the white is only ever composited when the renderer stops painting at close/destroy — one white frame before the window disappears, on both free and project windows regardless of close path.

The preload applies the persisted palette to the DOM before first paint (`createStartupThemePreload`), resolving `theme: 'system'` via `matchMedia`. The main process has the equivalent native signal: `nativeTheme.shouldUseDarkColors`.

## Goals / Non-Goals

Goals:
- No default-white frame ever composited for a main window: themed background at creation covers first paint and teardown.
- Single source of truth: the persisted palette already shipped to the window via `additionalArguments`.

Non-Goals:
- Live `setBackgroundColor` updates on theme switch for open windows (teardown mismatch for that one frame is negligible; revisit if it proves visible).
- Renderer/preload paint changes — the DOM theme pipeline is untouched.
- Vibrancy/transparency — not used by main windows.

## Decisions

### Set `backgroundColor` in `createMainWindowOptions` from the palette
Resolve the theme the same way the preload script does — `appearance.theme`, with `system` resolved via `nativeTheme.shouldUseDarkColors` — then take `themePalettes[resolved].background`.

*Why here:* the options builder is the single choke point for all main windows (free, project, restored); no call-site changes. *Alternative considered:* `hide()`-then-`destroy()` in close handlers — only covers `destroy()` paths, leaves the same latent white behind normal close, and adds teardown branching; rejected.

### Resolve `system` with `nativeTheme`, not the stored palette default
`nativeTheme.shouldUseDarkColors` is what the OS is showing right now, matching the renderer's `matchMedia` resolution and `task-manager.ts` precedent (which hardcodes `backgroundColor: '#1c1c1e'`).

*Note:* a mismatch is possible only if the OS theme flips between preference save and window creation — same window of time the renderer resolution already has; accepted.

## Risks / Trade-offs

- [Snapshot tests assert the full options object] → Update the affected expectations; options shape change is additive.
- [Palette `background` value could be invalid/missing] → It is already trusted for DOM paint via the preload; no new trust surface. Electron ignores invalid CSS colors with a warning.

## Migration Plan

None. Additive window option; no storage or IPC changes. Rollback = revert the single-file change.

## Open Questions

None.
