import { type WindowSpec, type WindowStateUpdate, updateWindowState } from './window-state'

interface WindowStateTrackerOptions {
  initialState: WindowSpec
  persist: (state: WindowSpec) => Promise<unknown>
  onError?: (caught: unknown) => void
  debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 250

function rectanglesEqual(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function statesEqual(left: WindowSpec, right: WindowSpec) {
  return (
    left.id === right.id &&
    left.isMaximized === right.isMaximized &&
    rectanglesEqual(left.frame, right.frame)
  )
}

export function createWindowStateTracker(options: WindowStateTrackerOptions) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  let current = options.initialState
  let isDirty = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let writeTail: Promise<unknown> = Promise.resolve()

  async function persistDirtyState() {
    if (!isDirty) {
      await writeTail
      return
    }

    isDirty = false
    const state = current
    const write = writeTail.catch(() => undefined).then(() => options.persist(state))
    writeTail = write
    await write
  }

  function schedulePersist() {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void persistDirtyState().catch((caught) => {
        isDirty = true
        options.onError?.(caught)
      })
    }, debounceMs)
  }

  return {
    update(update: WindowStateUpdate) {
      const next = updateWindowState(current, update)
      if (statesEqual(current, next)) return
      current = next
      isDirty = true
      schedulePersist()
    },
    async flush() {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      await persistDirtyState()
    },
  }
}
