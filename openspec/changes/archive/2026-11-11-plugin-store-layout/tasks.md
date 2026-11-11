# Tasks

## 1. Avatar helper

- [x] 1.1 Add a colocated pure helper in the settings components (e.g. `plugin-avatar.tsx`): string-hash → hue (×31 + char, golden-angle step, mod 360) and a `PluginAvatar` component rendering a rounded square (`size-9 rounded-lg`, bg `hsl(H 70% 90%)`, letter `hsl(H 46% 34%)`, uppercase first character). Verify: renders `F` for `frontend-design`; same output on re-render.

## 2. Two-column catalog layout

- [x] 2.1 In `InstallPluginPage` (install-page.tsx), replace the flat list wrapper with `grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-lg:grid-cols-1 gap-x-6` on `data-install-list`; keep `data-install-tile`, hover highlight, row click, and the `+` / `⋮` actions unchanged. Verify: `npm run check` passes; existing `agent-plugin-settings.test.tsx` install tests still pass.
- [x] 2.2 Confirm no column overflow: with a long-description entry, the description truncates with ellipsis and the grid stays within the 800px content container (mirror the prototype's `minmax(0,1fr)` fix). Verify: a jsdom test with a long description asserts the tile exists and the class list contains `minmax(0,1fr)` tracks; visual check via `npm run debug` CDP screenshot.
- [x] 2.3 Narrow-viewport single column: below the two-column breakpoint the list renders one column with the same row anatomy. Verify: jsdom test asserting `max-lg:grid-cols-1` class present (responsive behavior itself is CSS-driven).

## 3. Tests

- [x] 3.1 Unit-test the avatar helper: determinism (same name → same hue twice), hue within 0–359, uppercase first character rendered. Verify: `npx vitest run src/renderer/pages/settings/components/plugin-avatar.test.tsx`.
- [x] 3.2 Extend an install-page test: catalog renders into the two-column grid (`data-install-list` has the grid classes) and each tile starts with the avatar. Verify: `npx vitest run src/renderer/pages/settings/components/agent-plugin-settings.test.tsx`.

## 4. Validation

- [x] 4.1 Run affected tests and typecheck: `npx vitest run src/renderer/pages/settings/components/agent-plugin-settings.test.tsx src/renderer/pages/settings/components/plugin-avatar.test.tsx && npm run check`. Verify: all green.
- [x] 4.2 Lint and format changed files only. Verify: `npx eslint <changed files> && npx prettier --check <changed files>`.

## Workflow follow-up

- Archive the change with `/openspec-archive-change` (syncs the spec delta and moves `prototype.html` along).
