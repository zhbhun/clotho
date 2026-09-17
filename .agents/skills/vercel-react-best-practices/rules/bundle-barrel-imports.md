---
title: Avoid Barrel File Imports
impact: CRITICAL
impactDescription: avoids broad module graphs in hot entry paths
tags: bundle, imports, tree-shaking, barrel-files, performance
---

## Avoid Barrel File Imports

Prefer documented subpath imports over broad barrel files when profiling or Vite bundle output shows that a barrel pulls unnecessary modules into a hot entry path. **Barrel files** are entry points that re-export many modules.

**Incorrect (project-owned barrel pulls unrelated components):**

```tsx
import { Button } from '@/shadcn'
```

**Correct (stable public module path):**

```tsx
import { Button } from '@/shadcn/button'
```

Do not deep-import undocumented package internals. For third-party packages such as `lucide-react`, keep the public import unless the package documents typed subpath exports and measurement shows a problem.
