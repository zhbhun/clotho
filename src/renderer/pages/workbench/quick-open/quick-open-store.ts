import { create } from 'zustand'

export type QuickOpenState = {
  quickOpenOpen: boolean
  /** How many times openQuickOpen ran; each open request resets the query. */
  openCount: number
  /** Query the latest open request wants pre-filled, usually a mode prefix. */
  initialQuery: string
  openQuickOpen: (initialQuery?: string) => void
  closeQuickOpen: () => void
}

/** Global visibility for the quick-open panel mounted once by the session
    area. Shortcuts pass a mode prefix (`~`, `@`, ...) as the initial query. */
export const useQuickOpenStore = create<QuickOpenState>()((set) => ({
  quickOpenOpen: false,
  openCount: 0,
  initialQuery: '',
  openQuickOpen: (initialQuery = '') =>
    set((state) => ({
      quickOpenOpen: true,
      initialQuery,
      openCount: state.openCount + 1,
    })),
  closeQuickOpen: () => set({ quickOpenOpen: false }),
}))
