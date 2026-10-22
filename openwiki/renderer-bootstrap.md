---
type: "Reference"
title: "Renderer Bootstrap"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-b385e4ad33e4c56c060782a7
    resource: repo://src/main/startup-theme.ts
  - id: openwiki-source-204ad0eb4bd56fe46715fe8b
    resource: repo://src/renderer/app.tsx
  - id: openwiki-source-2d6a17d26be76d97fca4f549
    resource: repo://src/renderer/components/error-boundary.tsx
  - id: openwiki-source-9ebafa9580237419e71acbfd
    resource: repo://src/renderer/components/startup-failure.tsx
  - id: openwiki-source-0241f3b50981a0baf2d3adf5
    resource: repo://src/renderer/components/theme-provider.tsx
  - id: openwiki-source-0087ef144b96cf72715e9c52
    resource: repo://src/renderer/i18n/catalog.ts
  - id: openwiki-source-ded2508cb2594c2abb6d9df9
    resource: repo://src/renderer/i18n/language-provider.tsx
  - id: openwiki-source-99178a77560b27ee6ccddd7e
    resource: repo://src/renderer/i18n/languages.ts
  - id: openwiki-source-1438d57bdd8473d4baa58b7e
    resource: repo://src/renderer/i18n/resources.ts
  - id: openwiki-source-fc22958601a8fe1488eef2b7
    resource: repo://src/renderer/i18n/runtime.ts
  - id: openwiki-source-39e18faf4fe62278d38ba627
    resource: repo://src/renderer/main.tsx
  - id: openwiki-source-4dd98dded7e24139691fa607
    resource: repo://src/renderer/pages/workbench/services/session-persistence.ts
  - id: openwiki-source-6be96f55152af6aa5d8a8282
    resource: repo://src/renderer/pages/workbench/services/session-records.ts
  - id: openwiki-source-edf2af132d74c1801f2fcec0
    resource: repo://src/renderer/services/app-settings.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---


# Renderer Bootstrap

[src/renderer/main.tsx](../src/renderer/main.tsx) is the renderer's entry. It performs four React-independent installations first, then asynchronously assembles settings, persistence, and i18n, and only then calls `root.render`.

## Entry order

At module top (before any React rendering), in order:

```ts
installContextMenuGate({ isDev: import.meta.env.DEV })
installWebviewErrorLogging()
installWindowTitlebarDoubleClick()
```

All three are event-layer patches: the context-menu gate (paired with the main process's `textEditMenuItems`), global error logging, and titlebar double-click behavior. They must be in place before React, or errors and interactions during startup slip away.

Then `renderApp()` runs asynchronously:

1. `initializeAppSettings()` — pulls preferences from the main process via the `appGetPreferences` RPC ([app-settings.ts](../src/renderer/services/app-settings.ts)). The first thing it does with them is `applyAppearanceTheme(loadAppearancePreferences())`: **apply the theme to `<html>` before React mounts**, joining seamlessly with the preload's startup theme (see [Preload Bridge](./preload.md)).
2. `workbenchSessionPersistence.start()` — subscribes to the workbench store, writing session-catalog changes into the index.
3. Registers the `pagehide` flush chain (below).
4. `initializeAppI18n(preference, systemLanguages)` — i18n must be ready before rendering, avoiding raw keys in the first frame.
5. Sets `document.documentElement.lang`, then `root.render(<ErrorBoundary><LanguageProvider><ThemeProvider><App />`.

Any startup failure: `appLogger.error('webview.startup_failed')` and render [StartupFailure](#failure-uis).

## The settings service

`createAppSettingsService(client)` is a **write-behind store with rollback**:

- `current` holds the in-memory preferences, `confirmed` the values confirmed on disk, and `dirtyFields` which fields await a write.
- `persist(field)` only adds the field to `dirtyFields` and triggers one merged write: `mergeDirtyFields` overlays the dirty fields onto `confirmed` — a single save may carry other concurrently changed fields along.
- A save failure rolls `current` back to `confirmed` and rethrows; callers (theme, language) each toast and restore their UI state.
- An `initialize()` failure falls back to `DEFAULT_APP_PREFERENCES`, so unreadable settings never block startup.

`desktopSettingsClient` returns defaults directly on non-desktop runtimes (tests / pure browser) without issuing IPC.

## i18n

[i18n/](../src/renderer/i18n/) is a self-built lightweight scheme with no per-language JSON packs: **one column per language, written inside a single `messages(...)` call**.

- [languages.ts](../src/renderer/i18n/languages.ts)'s `LANGUAGE_PREFERENCES` lists 14 languages plus `system`. `resolveLanguagePreference` walks `navigator.languages` for `system`; `matchLanguage` exact-matches first (`_` normalized to `-`, lowercased), then takes the base language: `zh` maps to `zh-TW` on Hant/HK/MO/TW, else `zh-CN`; `pt` always `pt-BR`; the rest check the supported set; total miss falls back to `en`.
- [catalog.ts](../src/renderer/i18n/catalog.ts)'s `messages(en, zhCN, zhTW, ...)` takes 14 positional arguments returning a `Record<SupportedLanguage, string>` — misordering risk is contained by the `TranslationRow` type.
- [resources.ts](../src/renderer/i18n/resources.ts) merges the catalogs then **inverts** them into i18next's `{ language: { translation: { key: text } } }` shape; `MESSAGE_KEYS` derives from `messageCatalog`'s keys, so new keys enter every language automatically (a missing translation lands on the positional parameter — the compiler catches a skipped language).
- [runtime.ts](../src/renderer/i18n/runtime.ts) builds the i18next instance: `fallbackLng: 'en'`, `initAsync: false` (resources ship in the bundle), `interpolation.escapeValue: false` (React escapes), `supportedLngs` excluding `system`.

[language-provider.tsx](../src/renderer/i18n/language-provider.tsx) wraps `I18nextProvider`; `applyPreference` does four things at once: switch the i18next language, set `document.documentElement.lang`, `syncApplicationMenuLanguage` (via RPC so the main process rebuilds the native menu, see [Application Menu](./main-menu.md)), and persist. With `preference === 'system'` it listens for the `window`'s `languagechange` event to reapply. A persistence failure reverts both the preference and the DOM and toasts.

`useLanguage()` exposes `{ preference, setPreference }`.

## The pagehide flush chain

`pagehide` is the renderer's last reliable moment (`beforeunload` is unreliable in Electron). The one-time listener does three things:

```ts
void sessionPersistence.flush().catch(...)      // session input files
void flushAppSettings().catch(...)              // app preferences
webviewLogging.flush()                          // log batches
```

- `sessionPersistence.flush()` writes the write-behind store's dirty session records in one pass. Normal writes carry a **200ms** coalescing delay (`FLUSH_DELAY_MS`); `pagehide` does not wait.
- `flushAppSettings()` awaits the settings service's pending writes.
- `webviewLogging.flush()` pushes accumulated log batches to the main process.

The three never block each other, each catching and logging `persistence.flush_failed`. The main-process counterpart is in [Main Bootstrap](./main-bootstrap.md).

## Top-level providers

[app.tsx](../src/renderer/app.tsx)'s structure:

```
ShortcutRuntimeProvider        # shortcut runtime (see Shortcut System)
└── TooltipProvider           # shadcn tooltip
    ├── ShortcutScope scope="workbench"
    │   ├── ShortcutHost      # global shortcut listener
    │   └── WorkbenchPage     # the only page
    └── Toaster                # toast container
```

The whole app has one page ([WorkbenchPage](../src/renderer/pages/workbench/index.tsx)); the settings page is a route state of it, not a separate entry.

## Theme

[theme-provider.tsx](../src/renderer/components/theme-provider.tsx)'s `ThemeProvider`:

- State comes from `loadAppearancePreferences()`: `theme` (dark/light/system), `pointerCursor`, `reducedMotion`, and the dark and light `themePalettes`.
- `applyAppearanceTheme(preferences, nextTheme?)` resolves `system` to dark/light and classes the root element; **the clotho preset only removes inline variables** (colors belong to the stylesheet's derivation; inlining would freeze the palette from before a preset upgrade), other presets write `--primary` / `--background` / `--foreground`. This is the same rule as the preload's startup script, in a second copy.
- `theme === 'system'` watches `prefers-color-scheme` changes and reapplies.
- Theme switches default to `disableTransitionOnChange`: insert a `*{transition:none!important}` style, force one layout flush, then remove it after two `requestAnimationFrame`s — avoiding every color transitioning at once on a theme switch.
- `reducedMotion` of `system` follows `prefers-reduced-motion` (`useSystemReducedMotion` subscribes to changes), `reduce` always true, `no-preference` always false. The result lands in `document.documentElement.dataset.reducedMotion` and `dataset.pointerCursor` for CSS to switch on; it also passes `MotionConfig reducedMotion` to the motion library (`user` / `always` / `never`).
- `useTheme()` reads the context (throws outside the Provider); `useAppReducedMotion()` reads only the motion flag, returning false without a Provider instead of throwing — for deep components to use safely.
- Every setter persists via `persistAppearancePreferences` immediately after the in-memory change, restoring from `loadAppearancePreferences()` and toasting `settings-appearance-save-error` on failure.

A color change (`setThemeColor`) marks the preset `custom`, and that palette thereafter takes the inline-variable path.

## Failure UIs

Two layers:

- **[ErrorBoundary](../src/renderer/components/error-boundary.tsx)**: a class component (React requires it); `componentDidCatch` logs `render.failed` (with `componentStack`), supports `resetKeys` — a key change auto-resets — and functional fallbacks (receiving `reset`). main.tsx wraps the whole tree with it, fallback StartupFailure.
- **[StartupFailure](../src/renderer/components/startup-failure.tsx)**: **does not depend on i18n** — startup can fail before i18n initializes, so it reads copy directly from `catalog`'s `messages(...)` rows by `resolveStartupLanguage()` (raw preference + system language) and offers a "reload" button. The copy therefore must be handwritten in those rows, not referenced by message key.
