import { create } from 'zustand'

export type SwitcherPanelState = {
  projectSwitcherOpen: boolean
  sessionHistoryOpen: boolean
  openProjectSwitcher: () => void
  openSessionHistory: () => void
  closeProjectSwitcher: () => void
  closeSessionHistory: () => void
}

/** Global visibility for the switcher dialogs mounted once by the session area;
    opening one panel closes the other so the two pickers never stack. */
export const useSwitcherStore = create<SwitcherPanelState>()((set) => ({
  projectSwitcherOpen: false,
  sessionHistoryOpen: false,
  openProjectSwitcher: () => set({ projectSwitcherOpen: true, sessionHistoryOpen: false }),
  openSessionHistory: () => set({ sessionHistoryOpen: true, projectSwitcherOpen: false }),
  closeProjectSwitcher: () => set({ projectSwitcherOpen: false }),
  closeSessionHistory: () => set({ sessionHistoryOpen: false }),
}))
