---
title: Dynamic Imports for Heavy Components
impact: CRITICAL
impactDescription: keeps heavy optional UI out of the initial Vite chunk
tags: bundle, dynamic-import, code-splitting, vite, react-lazy
---

## Dynamic Imports for Heavy Components

Use `React.lazy` with a literal `import()` to split heavy components that are not needed on the initial path.

**Incorrect (Monaco bundles with main chunk ~300KB):**

```tsx
import { MonacoEditor } from './monaco-editor'

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

**Correct (Monaco loads on demand):**

```tsx
import { lazy, Suspense } from 'react'

const MonacoEditor = lazy(() =>
  import('./monaco-editor').then((module) => ({ default: module.MonacoEditor })),
)

function CodePanel({ code }: { code: string }) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse" />}>
      <MonacoEditor value={code} />
    </Suspense>
  )
}
```

Keep the import path literal so Vite can create a narrow, predictable chunk. Confirm the split in build output before adding more boundaries.
