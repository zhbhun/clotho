---
title: Prefer Statically Analyzable Paths
impact: HIGH
impactDescription: avoids accidental broad bundles
tags: bundle, vite, rollup, dynamic-import, path
---

## Prefer Statically Analyzable Paths

Vite works best when import paths are obvious at build time. If the real path is hidden inside a variable or composed too dynamically, the bundler may include a broad set of possible modules or warn that it cannot analyze the import.

Prefer explicit maps of literal `import()` calls so the set of reachable modules stays narrow and predictable.

When analysis becomes too broad, the cost is real:
- Larger client bundles
- Slower builds
- Slower startup
- More memory use

**Incorrect (the bundler cannot tell what may be imported):**

```ts
const PAGE_MODULES = {
  home: './pages/home',
  settings: './pages/settings',
} as const

const Page = await import(PAGE_MODULES[pageName])
```

**Correct (use an explicit map of allowed modules):**

```ts
const PAGE_MODULES = {
  home: () => import('./pages/home'),
  settings: () => import('./pages/settings'),
} as const

const Page = await PAGE_MODULES[pageName]()
```

Reference: [Vite features](https://vite.dev/guide/features.html#dynamic-import), [Rollup dynamic import variables](https://www.npmjs.com/package/@rollup/plugin-dynamic-import-vars)
