---
title: Parallelize Partially Dependent Work
impact: CRITICAL
impactDescription: 2-10× improvement
tags: async, parallelization, dependencies, promises
---

## Parallelize Partially Dependent Work

For operations with partial dependencies, create promise chains so each task starts as soon as its own inputs are available. Do not add a dependency for this pattern.

**Incorrect (profile waits for config unnecessarily):**

```typescript
const [user, config] = await Promise.all([
  fetchUser(),
  fetchConfig()
])
const profile = await fetchProfile(user.id)
```

**Correct (config and profile run in parallel without another library):**

```typescript
const userPromise = fetchUser()
const profilePromise = userPromise.then(user => fetchProfile(user.id))

const [user, config, profile] = await Promise.all([
  userPromise,
  fetchConfig(),
  profilePromise
])
```
