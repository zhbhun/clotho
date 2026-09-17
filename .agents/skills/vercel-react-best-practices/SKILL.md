---
name: vercel-react-best-practices
description: Use when writing, reviewing, or refactoring client-rendered React 19 code in this Vite desktop app, especially for slow rendering, unnecessary re-renders, async waterfalls, large bundles, or unresponsive interactions.
license: MIT
metadata:
  author: vercel
  version: '1.0.0-client'
---

# React and Vite Performance

Apply measured, client-side performance improvements to the React WebView. Read only the rules that match the observed bottleneck; do not turn the full catalog into a refactoring checklist.

## Project Scope

This skill applies to `src/renderer` and client-side code that runs in the Electron renderer.

- Use React 19, Vite code splitting, browser APIs, Zustand stores, and the existing desktop IPC/service layer.
- Keep backend work in `src/main`; this skill covers only the client-rendered renderer.
- Do not introduce a data-fetching library, router, or another dependency solely to follow a rule.
- Do not replace the desktop IPC bridge with HTTP fetching patterns.

## Workflow

1. Identify the user-visible symptom and confirm the hot path with code inspection, timing, profiling, or bundle output.
2. Open only the matching rule files under `rules/`.
3. Prefer the smallest change that addresses the measured cause.
4. Verify the affected behavior and compare the same measurement before and after.

## Quick Reference

| Symptom | Read first |
| --- | --- |
| Sequential RPC or async work | `async-defer-await`, `async-parallel`, `async-dependencies`, `async-cheap-condition-before-await` |
| Large initial Vite chunk | `bundle-dynamic-imports`, `bundle-conditional`, `bundle-preload`, `bundle-barrel-imports` |
| Typing or selection feels blocked | `rerender-transitions`, `rerender-use-deferred-value`, `rerender-defer-reads` |
| Too many component commits | `rerender-derived-state`, `rerender-derived-state-no-effect`, `rerender-memo`, `rerender-split-combined-hooks` |
| Large lists or expensive browser paint | `rendering-content-visibility`, `rendering-hoist-jsx`, `rendering-animate-svg-wrapper` |
| Hot JavaScript loop | Open the relevant `js-*` rule only after profiling identifies the loop |
| Stale callbacks or one-time initialization | `advanced-event-handler-refs`, `advanced-effect-event-deps`, `advanced-init-once`, `advanced-use-latest` |

List all available rules with:

```bash
rg --files .agents/skills/vercel-react-best-practices/rules
```

## Example: Lazy-Load a Heavy Panel

```tsx
import { lazy, Suspense } from 'react'

const DiffPanel = lazy(() =>
  import('./diff-panel').then((module) => ({ default: module.DiffPanel })),
)

export function SessionTools() {
  return (
    <Suspense fallback={<div className="h-32 animate-pulse" />}>
      <DiffPanel />
    </Suspense>
  )
}
```

Use this only when the panel is absent from the initial path and its chunk cost is material.

## Common Mistakes

- Applying every rule without evidence.
- Adding a cache, state library, or data-fetching library for a single optimization.
- Deep-importing undocumented package internals that break TypeScript or upgrades.
- Memoizing trivial expressions or unstable props.
- Moving urgent visual feedback into `startTransition`.
- Treating backend latency or RPC contract design as a React rendering problem.
