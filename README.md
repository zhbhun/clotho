# Clotho

Claude desktop client built with Electron, React, TypeScript, Vite, Tailwind CSS, and shadcn/ui.

Electron Forge orchestrates building and packaging. The main process runs on Node.js and talks to
the React renderer through a typed IPC bridge exposed by the preload script.

## Scripts

```bash
npm start
npm run package
npm run make
npm run typecheck
npm test
npm run lint
npm run format
```

- `npm start`: starts Electron Forge with the Vite dev server; the main window loads the dev
  server for live reload.
- `npm run package`: builds main, preload, and renderer targets, then packages the application
  into `out/`.
- `npm run make`: produces distributable installers through the configured makers.

After a fresh install, `npm install` is enough; Forge's Vite plugin builds all three targets
during `npm start` and `npm run package`.

## Structure

```text
src/renderer/          React frontend and shared frontend modules
src/renderer/pages/    Page-private UI, hooks, stores, services, and utilities
src/shadcn/            shadcn registry components
src/main/              Electron main process (backend)
src/main.ts            Electron entry point
src/preload/index.ts  Preload IPC bridge (window.clotho)
src/shared/            Shared RPC and Claude types
icons/                 App icons for packaging
```

## Development

The frontend talks to the Node.js main process through Electron IPC. Shared request and event
types live in `src/shared/rpc.ts`; the preload bridge lives in `src/preload/index.ts`; frontend wrappers
live under `src/renderer/services/desktop/` and `src/renderer/services/claude/`.
