import { create } from 'zustand'

import { useSwitcherStore } from '../session/stores/switcher-store'

export type QuickOpenState = {
  quickOpenOpen: boolean
  openQuickOpen: () => void
  closeQuickOpen: () => void
}

/** Global visibility for the quick-open panel mounted once by the session
    area. Opening it dismisses the other switchers so palettes never stack. */
export const useQuickOpenStore = create<QuickOpenState>()((set) => ({
  quickOpenOpen: false,
  openQuickOpen: () => {
    useSwitcherStore.getState().closeProjectSwitcher()
    useSwitcherStore.getState().closeSessionHistory()
    set({ quickOpenOpen: true })
  },
  closeQuickOpen: () => set({ quickOpenOpen: false }),
}))
