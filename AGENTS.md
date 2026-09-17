# AGENTS.md

**clotho** is a cross-platform Electron desktop application: a Node.js/TypeScript main process and a React frontend connected through Electron IPC (preload `contextBridge`).

## Technology stack

| Layer           | Technology                                                     |
| --------------- | -------------------------------------------------------------- |
| Frontend        | React 19, TypeScript 6, Vite 8                                 |
| Styling / UI    | Tailwind CSS 4, shadcn/ui (`base-mira`, Base UI), Lucide React |
| Backend         | Node.js (Electron main process), Electron Forge                |
| Bridge          | Electron IPC (`ipcMain.handle` / `webContents.send` via the preload `contextBridge`) |
| Testing         | Vitest, React Testing Library                                  |
| Quality         | ESLint 9, Prettier 3                                          |
| Package manager | **npm**                                                        |

## Project structure

```
clotho/
├── src/
│   ├── shared/      # Shared contracts
│   ├── main/        # Main process (backend)
│   ├── renderer/    # Frontend (renderer)
│   └── shadcn/      # Base UI components
├── src/main.ts      # Electron entry point
├── src/preload/index.ts  # Preload IPC bridge
├── icons/           # Packaging icons
└── Configuration files
```

### Shared

```
src/shared/
└── rpc.ts    # Shared types and the desktop IPC contract
```

- Store shared contracts only; do not put frontend or backend implementations here.
- Update both ends whenever the RPC contract changes.

### Backend

```
src/main/
├── index.ts              # Main-process bootstrap and IPC implementation
├── claude-service.ts     # Claude SDK lifecycle
└── claude/               # Project, session, file-search, and related modules

src/preload/index.ts exposes the typed IPC bridge (`window.clotho`) consumed by
`src/renderer/services/desktop/client.ts`.
```

- The main process may depend on `src/shared`, but must not depend on the frontend or shadcn.

### Frontend

`src/renderer` uses shared root modules plus self-contained `pages`.

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

- Keep page-private code in `pages/<page>/`.
- Promote code to a root-level shared directory only after it is reused by multiple pages.

### shadcn

```
src/shadcn/
├── <component>.tsx    # Registry component
├── hooks/
└── utils.ts           # cn()
```

- Store shadcn registry code only; do not depend on business modules. Put business components in `src/renderer`.
- See `components.json` for configuration. Add components with `npx shadcn@latest add <component>` and import them through `@/shadcn/<component>`.

## Development guidelines

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
- Do not use Chromium, Playwright, or ego-browser to test or accept this project's UI/functionality, and do not run `npm start`. The user starts the Electron app for manual verification; describe the verification method.
- By default, run only tests for affected modules; do not run the full suite unless explicitly requested. Run `npm run typecheck` for TypeScript changes; run ESLint and Prettier only on changed files. Run `npm run package` only when changing build-related files.

### Commit conventions

- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for Git commit messages.
- Basic format: `<type>[optional scope]: <short description>`; separate the body and footer with a blank line.
- Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
- Write commit messages in English.
- No AI-attribution trailers (e.g. `AI-Co-Authored-By`), even if a skill suggests one.
