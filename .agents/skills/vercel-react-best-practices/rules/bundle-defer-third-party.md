---
title: Defer Non-Critical Third-Party Libraries
impact: MEDIUM
impactDescription: keeps non-critical code out of the startup path
tags: bundle, third-party, analytics, defer
---

## Defer Non-Critical Third-Party Libraries

Analytics, logging, and other non-critical integrations should not block the WebView's first interactive render. Load them after the app mounts.

**Incorrect (blocks initial bundle):**

```tsx
import { startTelemetry } from './telemetry'

export function App() {
  startTelemetry()
  return <Workbench />
}
```

**Correct (loads after the first commit):**

```tsx
import { useEffect } from 'react'

export function App() {
  useEffect(() => {
    void import('./telemetry').then((module) => module.startTelemetry())
  }, [])

  return <Workbench />
}
```
