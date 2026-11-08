# AGENTS.md

**clotho** is a cross-platform Electron desktop application.

## Technology stack

- **Frontend**: React 19, TypeScript 6, Vite 8
- **Styling / UI**: Tailwind CSS 4, shadcn/ui (`base-mira`, Base UI), Lucide React
- **Backend**: Node.js (Electron main process), Electron Forge
- **Testing**: Vitest, React Testing Library
- **Quality**: ESLint 9, Prettier 3
- **Package manager**: npm

## Project structure

```
clotho/
├── src/
│   ├── shared/      # Shared contracts
│   ├── main/        # Main process (backend)
│   ├── preload/     # Preload IPC bridge
│   ├── renderer/    # Frontend (renderer)
│   └── shadcn/      # Base UI components
├── icons/           # Packaging icons
└── ...
```

### Shared

`src/shared/` holds shared contracts only (no frontend/backend implementations); update both ends whenever the RPC contract changes.

```
src/shared/
└── rpc.ts    # Shared types and the desktop IPC contract
```

### Backend

`src/main/` is the Electron main process (backend): it may depend on `src/shared` but must not depend on the frontend or shadcn. `src/preload/index.ts` exposes the typed IPC bridge (`window.clotho`) consumed by `src/renderer/services/desktop/client.ts`.

```
src/main/
├── index.ts              # Main-process bootstrap and IPC implementation
├── claude-service.ts     # Claude SDK lifecycle
└── claude/               # Project, session, file-search, and related modules
```

### Frontend

`src/renderer` uses shared root modules plus self-contained `pages`; keep page-private code in `pages/<page>/` and promote code to a root-level shared directory only after it is reused by multiple pages.

```
src/renderer/
├── main.tsx                   # React entry point
├── app.tsx                    # Application composition
├── index.css                  # Global styles
├── assets/
├── components/                # Cross-page UI
├── hooks/                     # Cross-page hooks
├── stores/                    # Cross-page state
├── services/                  # Cross-page capabilities
├── utils/                     # Shared pure functions
└── pages/                     # Pages
    └── <page>/
        ├── index.tsx          # Page entry point
        ├── components/
        ├── hooks/
        ├── stores/
        ├── services/
        └── utils/
```

### shadcn

`src/shadcn/` holds shadcn registry code only — no business modules (those go in `src/renderer`); see `components.json` for configuration, add components with `npx shadcn@latest add <component>`, and import them through `@/shadcn/<component>`.

```
src/shadcn/
├── <component>.tsx    # Registry component
├── hooks/
└── utils.ts           # cn()
```

## Development standards

### Naming conventions

Keep names short while preserving meaning. Split and refine names as responsibilities or size grow; avoid verbose compound names too early.

- Use `kebab-case` for files and directories; use the matching `.test.ts(x)` suffix for test files.
- Use `PascalCase` for components, classes, types, interfaces, and enums.
- Use `camelCase` for variables, functions, and methods.
- Prefix hooks with `use`; name events `handleXxx` / `onXxx`.
- Use `UPPER_SNAKE_CASE` for fixed constants.
- Prefer `is`, `has`, `can`, and `should` prefixes for booleans.

### Module boundaries

- Keep continuously-coupled logic — where understanding one part requires tracing the rest — under roughly 300 lines; flat assemblies of small, self-contained units (e.g. a store creator registering independent actions) may exceed it. Use single responsibility and the primary data flow to decide when to split.
- Extract a cohesive module when understanding or changing one responsibility requires tracing many interconnected functions, components, hooks, types, and state, or scanning unrelated code.
- Split files by responsibility, data flow, and reuse when they contain multiple independently nameable responsibilities or intertwined business logic.
- Long configuration, mapping, type, and static-data sections may stay in one file when their structure is clear and they do not require continuous reasoning.
- Preserve a clear entry point and concise interfaces when splitting. Move reusable or complex implementations into focused files; keep small, closely related code nearby. Do not split mechanically by line count or create forwarding-only fragments.

### TypeScript / React

- Enable strict mode and use function components with hooks by default. A focused class component is allowed when React requires one for an Error Boundary.
- Use relative paths inside `src/renderer`; use aliases across modules: `@/shadcn/*` → `src/shadcn/*`, `@/shared/*` → `src/shared/*`.
- Web semantics and keyboard accessibility are not current project goals. Without an explicit requirement, prefer `div` for interactive containers when practical instead of changing to `button` / `a` or adding ARIA, `tabIndex`, and keyboard handlers solely for semantics. Follow platform capabilities, component APIs, and explicit requirements when they require otherwise.

### Code style

- **ESLint**: `npm run lint` (covers `**/*.{ts,tsx}` and `**/*.css`; ignores `build`, `dist`, `node_modules`, `.hutch`, `.vite`, and `out`)
- **Prettier**: `npm run format`; single quotes, no semicolons, `printWidth: 100`; sort imports as built-in → third-party → `@/` → relative paths

### Testing guidelines

- Use Vitest + jsdom/node for the frontend and the Electron main process. Keep tests next to source files and name them `*.test.ts(x)`.
- Use unit tests sparingly: add them only when they protect against meaningful, realistic regressions and justify their maintenance cost; do not write tests for coverage, implementation details, trivial code, visual tuning, or behavior already guaranteed by third-party libraries.
- Do not drive app tests with external browsers or automation frameworks (Chromium, Playwright, ego-browser), and do not run plain `npm start`. Verify behavior instead via `npm run debug` (renderer CDP on 3367, main-process inspector on 3368): check `curl -s http://127.0.0.1:3367/json/version` first and reuse an existing instance, drive checks over CDP (e.g. `Runtime.evaluate`), and stop the app if you started it.
- By default, run only tests for affected modules; do not run the full suite unless explicitly requested. Run `npm run check` for TypeScript changes; run ESLint and Prettier only on changed files. Run `npm run package` only when changing build-related files.

### Commit conventions

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for Git commit messages.
- Basic format: `<type>[optional scope]: <short description>`; separate the body and footer with a blank line.
- Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
- Write commit messages in English.
- No AI-attribution trailers (e.g. `AI-Co-Authored-By`), even if a skill suggests one.

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading. All OpenWiki pages must be written in English (code identifiers stay verbatim).

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate. When generating or updating the wiki, write all page content in English.

<!-- OPENWIKI:END -->

## Develop Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 5. OpenSpec workflow

- New features and functional changes MUST go through the OpenSpec spec-driven workflow: explore (think through ideas) → propose (create the change with proposal/specs/design/tasks) → apply (implement the tasks) → archive (sync specs and move the change to `openspec/changes/archive/`).
- When explore involves UI or interaction adjustments, build a prototype demo with the `prototype` skill in a temporary directory, move it to `openspec/changes/<change-name>/prototype.html` at propose, and archive it together with the change.

