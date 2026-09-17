export const UI_STORAGE_KEY = 'clotho-ui:v1'

export type UiState = Record<string, unknown>
export type UiStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const memoryValues = new Map<string, string>()
const memoryStorage: UiStorage = {
  getItem: (key) => memoryValues.get(key) ?? null,
  setItem: (key, value) => memoryValues.set(key, value),
  removeItem: (key) => memoryValues.delete(key),
}

function browserStorage(): UiStorage {
  try {
    return typeof window === 'undefined' ? memoryStorage : window.localStorage
  } catch {
    return memoryStorage
  }
}

export function readUiState(storage: UiStorage = browserStorage()): UiState {
  try {
    const raw = storage.getItem(UI_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as UiState) : {}
  } catch {
    return {}
  }
}

export function replaceUiState(state: UiState, storage: UiStorage = browserStorage()) {
  try {
    storage.setItem(UI_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best-effort UI restoration must not make the application unusable.
  }
}

export function updateUiState(patch: UiState, storage: UiStorage = browserStorage()) {
  replaceUiState({ ...readUiState(storage), ...patch }, storage)
}
