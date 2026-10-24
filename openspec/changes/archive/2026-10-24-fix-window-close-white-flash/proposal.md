# Proposal

## Why

Closing any window (free or project) flashes a white frame on macOS: `BrowserWindow` options never set `backgroundColor`, so when the renderer stops painting at close/destroy, the macOS compositor samples the default white background for a frame before the window disappears. The default white is also visible as a risk at first show for slow loads, since only the preload theme script currently guarantees themed paint.

## What Changes

- Set `backgroundColor` on every main `BrowserWindow` from the persisted appearance palette (`themePalettes[resolvedTheme].background`), resolving `theme: 'system'` via `nativeTheme.shouldUseDarkColors`.
- Closing a window no longer flashes white: the teardown frame paints the themed background instead of Electron's default white.
- Out of scope: runtime re-theming of already-open windows (`setBackgroundColor` on theme switch). The teardown flash only samples the stored creation-time color; a theme switch mid-session leaves a small mismatch for that one frame only. Recorded as a known limitation.

## Capabilities

### New Capabilities

- `workbench-window-appearance`: Owns the native window background color for main windows: every main window is created with a themed `backgroundColor` so no default-white frame is ever composited, at first paint or at teardown.

### Modified Capabilities

- (none — `workbench-window-state` owns persisted window entries, not paint behavior)

## Impact

- `src/main/window-options.ts`: `createMainWindowOptions` gains the background color (needs `nativeTheme` from `electron`).
- No renderer, preload, IPC, or storage changes; `appearance` is already passed to the options builder.
- Tests: `src/main/window-options` options snapshot/shape expectations, if any assert the full options object.
