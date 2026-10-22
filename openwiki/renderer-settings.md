---
type: "Reference"
title: "Settings Page"
description: "The settings page: provider configuration, appearance, shortcuts, project and session defaults, and language."
tags: ["renderer", "settings", "providers", "theme", "shortcuts"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-ef56a25b7b2779765a9a4efc
    resource: repo://src/renderer/components/model-configuration/provider-presets.ts
  - id: openwiki-source-4c4cd5e8b5a7d4b39150df12
    resource: repo://src/renderer/components/model-configuration/provider-usage-badges.tsx
  - id: openwiki-source-c2f48bd6a345e264b639fb88
    resource: repo://src/renderer/components/model-configuration/use-provider-draft.ts
  - id: openwiki-source-02e5f4dac02d6c6f3faba5f4
    resource: repo://src/renderer/pages/settings/components/appearance-settings.tsx
  - id: openwiki-source-91fcbc79c035538726efd066
    resource: repo://src/renderer/pages/settings/components/language-settings.tsx
  - id: openwiki-source-1db729303ad0b9ebf50bd9f4
    resource: repo://src/renderer/pages/settings/components/project-settings.tsx
  - id: openwiki-source-fc1af4c19f02ab9927e07ebc
    resource: repo://src/renderer/pages/settings/components/provider-settings.tsx
  - id: openwiki-source-90b180b164dd90c56316a507
    resource: repo://src/renderer/pages/settings/components/session-settings.tsx
  - id: openwiki-source-95b4d8e6b0fdc00f63c2d6e7
    resource: repo://src/renderer/pages/settings/components/shortcut-recorder.tsx
  - id: openwiki-source-be46cb55965c8eb1cbbad877
    resource: repo://src/renderer/pages/settings/components/shortcut-settings.tsx
  - id: openwiki-source-546bb3b2575bf564d384e68b
    resource: repo://src/renderer/pages/settings/components/theme-settings.tsx
  - id: openwiki-source-4b587f6d666265542abe9e47
    resource: repo://src/renderer/pages/settings/components/use-provider-editor.ts
  - id: openwiki-source-32c6ff52a95d1f36ebffbc12
    resource: repo://src/renderer/pages/settings/components/use-provider-settings.ts
  - id: openwiki-source-1c364201d44076a008f72fc6
    resource: repo://src/renderer/pages/settings/index.tsx
  - id: openwiki-source-f77303544734648c3b55de37
    resource: repo://src/renderer/services/theme-presets.ts
  - id: openwiki-source-a4c09b3ec25717384ee31e34
    resource: repo://src/renderer/stores/model-configuration-store.ts
  - id: openwiki-source-98e468de8624ed4c3d64a5d8
    resource: repo://src/renderer/stores/provider-usage-store.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Settings Page

Settings are not a separate entry but a route state of [WorkbenchPage](./renderer-workbench.md): [pages/settings/index.tsx](../src/renderer/pages/settings/index.tsx) renders a **fullscreen Dialog** (filling the viewport, no rounded corners, no close button), with a category sidebar on the left and the current category's content on the right.

## Shell and navigation

Five categories are fixed in `CATEGORIES`: general, models, appearance, shortcuts, projects. General holds language, permission, and sessions; models is providers; appearance is theme and palettes; shortcuts is the shortcut table; projects is the project list.

Category switching uses `hidden` rather than unmounting — all five categories' DOM always exists, just hidden. The benefit: switching never loses scroll positions or internal state; the cost: first render builds all five subtrees.

Keyboard navigation runs through the sidebar buttons' `handleCategoryKeyDown`: `ArrowUp`/`ArrowDown` cycle, `Home`/`End` jump to the ends, paired with a `focusedCategoryId` (only its button gets `tabIndex=0`, the rest -1) for a roving tabindex.

Three error-boundary layers: one for the whole page (failure shows a `FailureEmpty` with a back button, `resetKeys={[open]}`), one per category (failure shows retry), and each content's own failure states.

On open, `initialCategory` lands on `categoryId`; `resolveFinalFocus` handles focus return on close — preferring the trigger captured at open, requiring it `isConnected` with `tabIndex >= 0`; otherwise a `queueMicrotask` hands focus to the fallback target. The whole Dialog sits inside `ShortcutScope scope="settings"`, so keys pressed while editing the shortcut table never fire app commands (see [Shortcut System](./renderer-shortcuts.md)).

## The model-configuration store

[stores/model-configuration-store.ts](../src/renderer/stores/model-configuration-store.ts) is the **cross-session, per-window** app-level model catalog (held by [SessionControllerRegistry](./renderer-session.md) and injected into each session controller; the settings page and composer share one instance).

Two write entries:

- **`initialize(initialization)`**: comes from `claude.startup()`, effective only while `isSdkInitializationComplete` is false (idempotent). It merges the SDK's models with provider-derived models — provider models dedupe by `providerId + value` then append, so a provider just added in settings appears in the composer without waiting for the next startup.
- **`replaceSettings(providers, defaultModel)`**: called after the settings page adds or removes providers, rebuilding the list from claudeModels plus provider models.

`hasConfiguredProviders` and `hasClaudeAuthentication` are the two judgments that **trigger model onboarding**: when both are false, `ModelOnboardingGate` takes over the UI (see [Session View](./renderer-session.md)). `isModelAccessResolved` marks whether the main process explicitly reported both — when not, it guesses from model count.

## Provider settings

[provider-settings.tsx](../src/renderer/pages/settings/components/provider-settings.tsx) stacks top to bottom: default-model selection, provider list, edit dialog, delete confirmation.

**The default model** is the app-level `providerId/modelId` string stored in the main process (see [Main Storage](./main-storage.md)); `DefaultModelSettings` handles choosing and saving.

**The list**: each card shows name, model-count badge, and baseURL, with edit and delete buttons on hover. The edit button stores **the trigger button element** in `editorTriggerRef`, returning focus per `closeType` when the editor closes — keyboard closes return it, mouse closes do not (otherwise focus jumps back inexplicably).

**Editing** is driven by [use-provider-editor.ts](../src/renderer/pages/settings/components/use-provider-editor.ts) with three open modes: blank, from a preset, editing existing (existing deep-copies the models array so drafts never mutate store objects). Pre-save validation:

- provider id: non-empty, format-valid, **not duplicating an existing id on create** (editing itself does not count)
- at least one non-empty model id
- a legal context window (`hasInvalidContextWindow`)

After save it merges the result into the local list first (UI reflects immediately), then calls `getDefaultModel()` to refresh the default model once — a deleted provider may have been the current default, which the main process clears. Failure only toasts; the local list does not roll back (the next load corrects it).

**Deletion** goes through a confirm dialog, then likewise local delete, dropping the usage cache, then refreshing the default model.

**Draft state** lives in [use-provider-draft.ts](../src/renderer/components/model-configuration/use-provider-draft.ts), shared by the settings page's editor and the workbench's onboarding wizard for identical behavior. Three details worth noting:

- **Changing the provider id recomputes models**: `autoThinkingForModel` derives each model's default thinking budget from provider + model id, so changing the id from `kimi` to `deepseek` switches untouched models to the new provider's defaults.
- **Changing a model id** triggers the same recompute and clears that row's error mark.
- **`fetchModels`** pulls model ids from the provider's `/models` endpoint, deduping by id and appending; failures toast.

[provider-presets.ts](../src/renderer/components/model-configuration/provider-presets.ts) is the built-in preset table (converted from cc-switch). The file-header comment states the inclusion bar: only providers that **natively pass through Anthropic requests** stay; excluded are official presets without `ANTHROPIC_BASE_URL`, OAuth types (github_copilot / codex_oauth / xai_oauth), non-Anthropic formats (openai_chat / openai_responses / gemini_native), and AWS Bedrock (SigV4 plus regional templates are incompatible with clotho's auth model). baseURL and models are starting points, user-editable. The list sorts by name with `Intl.Collator`.

## Provider usage

[provider-usage-store.ts](../src/renderer/stores/provider-usage-store.ts) is the cache **shared** by the settings page's provider cards and the composer's model menu: a `Record<providerId, ProviderUsageQuota>` plus `pendingIds`. The point of sharing, per the comment: both sides show one cache and never duplicate in-flight requests.

Three guards:

1. **Whitelist gate**: providers failing `isProviderUsageSupported(baseURL)` are never queried; custom or proxied baseURLs never receive probe requests.
2. **In-flight dedupe**: ids already in `pendingIds` return immediately.
3. **Shape validation**: `isWellFormedQuota` requires a boolean `success`, an array `windows`, and a numeric `queriedAt` — non-conforming responses drop and **never enter the cache**, preventing backend mismatches from polluting shared data.

Network-failed promises reject and leave the old snapshot untouched; deterministic failures (invalid key, unsupported) persist as `success: false`. `refreshAll` filters unsupported providers and skips those already fetched and in-flight.

Display lives in [provider-usage-badges.tsx](../src/renderer/components/model-configuration/provider-usage-badges.tsx): at most three concentric rings, **the outermost the shortest period** (ordered by `RING_PERIOD_HOURS`, 5H < 7D < 30D, unknown periods first), radii 7 / 4.5 / 2, stroke 2. `balance` windows stay out of the rings, shown as a separate balance text; each window's tooltip gives the reset's absolute time (`toLocaleString`, month/day/hour/minute).

## Appearance

[appearance-settings.tsx](../src/renderer/pages/settings/components/appearance-settings.tsx) has three blocks: theme selection, palettes, other preferences.

**Theme** ([theme-settings.tsx](../src/renderer/pages/settings/components/theme-settings.tsx)) is three radio cards: system / light / dark. Each card is a **thumbnail preview** computed live with `color-mix(in oklab, …)` from the current palette's three values — canvas is background mixed with 7% foreground, lines are foreground at 58% transparency. The `system` option's preview is `clip-path` split into halves, light left, dark right.

Two comment notes: the previews use **oklab rather than oklch** because preview palettes trip a Chromium hue-splitting bug; and the split gradient on the light canvas uses a `--split-tint` variable (18% on light pages, 45% on dark) that must stay hand-synced with the constant `CANVAS_TINT`.

**Palettes** ([theme-palette-settings.tsx](../src/renderer/pages/settings/components/theme-palette-settings.tsx)) display per variant, with **the side hidden under the current theme suppressed** (theme light hides dark's palettes). Each row holds accent / background / foreground color inputs, with a preset dropdown on top — presets list only that variant's (`THEME_PRESETS[variant]`), plus a "custom" entry when currently custom.

[theme-presets.ts](../src/renderer/services/theme-presets.ts) defines the presets: 11 dark, 10 light, both sides including clotho / codex / github / linear / notion / one / raycast / xcode. `resolveThemePalettes` **re-resolves non-custom presets into concrete color values** at read time — when a preset changes its colors, old preferences naming that preset follow the new colors automatically; only an unresolvable (deleted) preset falls back to defaults. `isThemePalettes` validation requires all three fields to be 6-digit hex and the preset name to be in that variant's list or `custom`.

**Other preferences**: the pointer-cursor toggle (`pointerCursor`) and the reduced-motion triple (system / reduce / no-preference). Both semantics are in [Renderer Bootstrap](./renderer-bootstrap.md).

## Shortcuts

[shortcut-settings.tsx](../src/renderer/pages/settings/components/shortcut-settings.tsx) is a searchable command table: a search box (`useDeferredValue` against jank), each row's current binding, and hover-revealed edit/reset/clear buttons. Overrides subscribe directly from `runtime.overrides` with `useSyncExternalStore`, never through React state.

The toolbar **sticks to the top**: a `useLayoutEffect` measures whether the toolbar's top crosses the scroll viewport's top, adding a shadow class when so; viewport scroll and window resize both re-measure.

[shortcut-recorder.tsx](../src/renderer/pages/settings/components/shortcut-recorder.tsx) is the recording dialog. Opening calls `runtime.capture.begin()` to claim the keyboard (the returned endCapture runs at close), then `interpretShortcutCapture` translates native key events into four results:

- `wait` — still composing, ignore
- `cancel` — Esc, close
- `clear` — Backspace, clear the binding
- `invalid` — no modifier, report `requiresModifier`

A legal binding immediately runs `findShortcutConflicts` for conflicts, split into **hard** (claimed by another command in the same scope; cannot save) and **shadow** (masked by a more specific binding; savable but inert). Saving goes through `runtime.overrides.set(commandId, [binding])`; an empty array means clear. Details in [Shortcut System](./renderer-shortcuts.md).

## Projects and sessions

**Project settings** ([project-settings.tsx](../src/renderer/pages/settings/components/project-settings.tsx)) list user-added projects (`isUserProject`), each row showing icon, name, and path, with edit and delete on hover. Deletion also confirms. The list sorts by name. Project CRUD arrives through workbench props (`onCreateProject` / `onEditProject` / `onRemoveProject` / `onReloadProjects`); the settings page itself issues no RPC.

**Session settings** ([session-settings.tsx](../src/renderer/pages/settings/components/session-settings.tsx)) hold one item: how long inactivity before auto-archive (0/1/2/7/14 days). It reads and writes the app-settings service directly — **optimistic update**: local state changes first for responsiveness, a save failure re-reads the confirmed value with `loadArchiveInactiveSessions()` and toasts. One of the few settings-page items outside the theme/language "rollback + toast" common path, but following the same pattern.

**Permission settings** ([permission-settings.tsx](../src/renderer/pages/settings/components/permission-settings.tsx)) pick the default permission mode, likewise optimistic with rollback. The chosen mode becomes new sessions' initial permission mode and where `ExitPlanMode` lands after approving a plan (see [Session View](./renderer-session.md)).

**Language settings** ([language-settings.tsx](../src/renderer/pages/settings/components/language-settings.tsx)) one dropdown, 14 languages plus "follow system". Language names display **in their own language** (简体中文, Deutsch, 日本語…), never translated into the current language. Switching goes through `LanguageProvider`, changing i18next, `document.documentElement.lang`, and the native menu language together, then persisting (see [Renderer Bootstrap](./renderer-bootstrap.md)).
