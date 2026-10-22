---
type: "Reference"
title: "Build and Testing"
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-1911308755a010411fc9869e
    resource: repo://.prettierrc
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-2fda883e9b76745f69f487f7
    resource: repo://eslint.config.mjs
  - id: openwiki-source-e8625b5b4c5848ac6b0576e3
    resource: repo://forge.config.ts
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-7eca48f8299985cadf3fb361
    resource: repo://vite.main.config.mts
  - id: openwiki-source-5536a16666eae7b3e8c12053
    resource: repo://vite.renderer.config.mts
  - id: openwiki-source-fbadcd8591b65031efaaedce
    resource: repo://vitest.config.ts
  - id: openwiki-source-fa7e60e4d16a0910621fd6db
    resource: repo://vitest.setup.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Build and Testing

Clotho uses Electron Forge to orchestrate packaging, Vite for the three build targets, and Vitest for unit tests. This page covers the build configuration's shape, the test layout, and the project's prescribed verification workflow.

## Build targets

The `VitePlugin` in [forge.config.ts](../forge.config.ts) declares three build targets:

| Target | Entry | Config | Output |
| --- | --- | --- | --- |
| `main` | `src/main/index.ts` | `vite.main.config.mts` | `.vite/build/main.js` |
| `preload` | `src/preload/index.ts` | `vite.preload.config.mts` | `.vite/build/preload.js` |
| `main_window` (renderer) | `src/renderer/main.tsx` | `vite.renderer.config.mts` | `.vite/renderer/main_window/` |

All three Vite configs register the same path aliases: `@/shadcn` → `src/shadcn`, `@/shared` → `src/shared` (see `compilerOptions.paths` in [tsconfig.json](../tsconfig.json)).

`vite.main.config.mts` marks `electron`, `@anthropic-ai/claude-agent-sdk`, and `@ff-labs/fff-node` as `external`. These packages are either provided by the Electron runtime or need to spawn subprocesses / dlopen native libraries from `node_modules` at runtime, so they cannot be bundled. The output filename is pinned to `main.js` to keep package.json's `"main": ".vite/build/main.js"` contract intact.

`vite.preload.config.mts` carries a local plugin, `normalizeLegacyInlineDynamicImports`. `@electron-forge/plugin-vite` still sets the deprecated `inlineDynamicImports` on the preload build, and Rolldown warns on every build; the plugin folds it into the equivalent `codeSplitting: false` before Vite resolves the build options.

`vite.renderer.config.mts` wires in the `react()` and `tailwindcss()` plugins; `base: './'` makes the packaged HTML load assets with relative paths, and the dev server runs on port `3366` (`DEV_SERVER_PORT`, see [src/main/main-view-url.ts](../src/main/main-view-url.ts)).

## External runtime packages

`EXTERNAL_RUNTIME_PACKAGES` at the top of `forge.config.ts`, plus three per-platform expansion functions, lists the packages that must stay in `node_modules` (inside the asar):

- `claudeAgentSdkPlatformPackages`: the Claude Agent SDK's CLI binaries live in `@anthropic-ai/claude-agent-sdk-<platform>-<arch>`; one for darwin, one for win32, two for linux (gnu and musl).
- `fffBinPackages`: `@ff-labs/fff-bin-<platform>-<arch>`, the dylib/dll/so used for file search.
- `ffiRsBindingPackages`: `@yuuang/ffi-rs-<suffix>`, ffi-rs's NAPI bindings.

The `packageAfterCopy` hook copies these packages from the repo's `node_modules` into the build directory after packaging, copying only entries that actually exist (`existsSync`). Meanwhile `packagerConfig.asar.unpack` keeps these binaries outside the asar with patterns like `**/*.node` and `**/node_modules/@anthropic-ai/claude-agent-sdk-*/**` — they must land on disk for the OS to spawn or dlopen them.

`FusesPlugin` pins Electron behavior at packaging time: disable `RunAsNode`, enable cookie encryption, disable `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments`, enable asar integrity validation, and load the app only from the asar.

Makers are configured for Squirrel (Windows), ZIP (darwin), Rpm, and Deb.

## Test layout

Test files sit next to the code they test, named `*.test.ts(x)`. The repo currently has 154 test files with roughly 1030 `it(...)` cases, distributed roughly as:

- `src/main` — 42 (of which `src/main/claude` 24, `src/main/logging` 5)
- `src/renderer` — about 107 (`pages/workbench` dominates; `services/shortcuts` 9, `components` 9)
- `src/shadcn` — 3
- `src/shared` — 1

Key settings in [vitest.config.ts](../vitest.config.ts):

- `test.dir` points at `src`, `environment: 'jsdom'`, `css: true`.
- Aliases match the Vite builds (`@/shadcn`, `@/shared`).
- `setupFiles` points at [vitest.setup.ts](../vitest.setup.ts).

[vitest.setup.ts](../vitest.setup.ts) fills in browser capabilities jsdom lacks, each with a comment naming the library that needs it:

- `ResizeObserver` and `IntersectionObserver` stubs (the latter was once pulled in transitively by ahooks; ahooks 3.10 no longer imports it).
- `Element.prototype.getAnimations` (Base UI ScrollArea scroll-animation detection).
- `Element.prototype.scrollIntoView` (called by cmdk keyboard navigation; assigned as a plain property rather than via `Object.defineProperty`, so tests can replace it with `vi.fn()`).
- `BASE_UI_ANIMATIONS_DISABLED = true`, so Base UI overlays unmount synchronously.
- An in-memory `localStorage` (jsdom has an implementation but it is unreliable; replaced with a controllable Map version).
- `@testing-library/jest-dom/vitest` and `afterEach(cleanup)`.
- Top-level `await initializeAppI18n('zh-CN', ['zh-CN'])`, repeated in `beforeEach`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Launch the app with Electron Forge + the Vite dev server |
| `npm run debug` | Same, plus renderer CDP on 3367 and the main-process inspector on 3368 |
| `npm run package` | Build all three targets and package into `out/` |
| `npm run make` | Produce per-platform installers |
| `npm run check` | `tsc --noEmit`, the TypeScript check |
| `npm test` | `vitest run`, the full test suite |
| `npm run lint` | ESLint (`**/*.{ts,tsx}` and `**/*.css`) |
| `npm run format` | Prettier write-back |

Note the TypeScript check script is named `check`, not `typecheck`.

[eslint.config.mjs](../eslint.config.mjs) uses flat config: TS files get `js.configs.recommended` + `tseslint.configs.recommended` + the React trio; CSS files get their own block with `language: 'css/css'` and the custom `tailwind4` syntax. Ignores `build`, `dist`, `node_modules`, `.hutch`, `.vite`, and `out`.

[.prettierrc](../.prettierrc): single quotes, no semicolons, `printWidth: 100`, `trailingComma: all`; `@trivago/prettier-plugin-sort-imports` orders imports as built-in → third-party → `^@/` → `^[../]` → `^[./]`, with blank lines between groups.

## Verification workflow

The project prescribes this order for verifying changes:

1. `npm run check` (mandatory for TypeScript changes).
2. Run only the Vitest cases for affected modules, not the full suite; the full suite requires an explicit request.
3. Run ESLint and Prettier only on changed files.
4. Run `npm run package` only when build-related files changed.

Runtime verification goes through CDP — no Playwright/Chromium, no `npm start`:

- First `curl -s http://127.0.0.1:3367/json/version` to check whether a `npm run debug` instance is already running; reuse it rather than starting a new one.
- Drive verification over CDP, e.g. `Runtime.evaluate` against the renderer.
- Stop any app instance you started.

The two `npm run debug` ports: 3367 is the renderer's remote debugging, 3368 the main process's Node inspector.
