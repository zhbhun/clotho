import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { initializeAppI18n } from './src/renderer/i18n/runtime'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// jsdom does not implement IntersectionObserver; earlier this was provided only by the
// transitive intersection-observer polyfill (via ahooks), which ahooks 3.10 stopped importing.
class IntersectionObserverStub {
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver

// jsdom has no Web Animations API; Base UI ScrollArea calls it to detect scroll animations.
if (typeof window !== 'undefined' && !window.Element.prototype.getAnimations) {
  Object.defineProperty(window.Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
}
// jsdom does not implement scrollIntoView; cmdk calls it when keyboard navigation highlights an item.
// Use a plain assignment so it remains writable and tests can replace it with vi.fn().
if (typeof window !== 'undefined' && !window.Element.prototype.scrollIntoView) {
  window.Element.prototype.scrollIntoView = () => {}
}
// jsdom does not run CSS animations; unmount Base UI popups synchronously instead of waiting for animation detection.
;(globalThis as Record<string, unknown>).BASE_UI_ANIMATIONS_DISABLED = true

function createTestStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.get(key) ?? null
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key) {
      store.delete(key)
    },
    setItem(key, value) {
      store.set(key, value)
    },
  }
}

const testStorage = createTestStorage()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testStorage,
})

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: testStorage,
  })
}

await initializeAppI18n('zh-CN', ['zh-CN'])

beforeEach(async () => {
  await initializeAppI18n('zh-CN', ['zh-CN'])
})

afterEach(() => {
  cleanup()
})
