import { create } from 'zustand'

/**
 * Which view the Subagents category shows: the list, or the second-level
 * detail page for an existing subagent (`file`) or a new one (`null`).
 */
export type SubagentDetailView = { kind: 'detail'; file: string | null } | { kind: 'list' }

interface SubagentDetailState {
  view: SubagentDetailView
  /** The detail form has unsaved changes; list-bound navigation must confirm. */
  isDirty: boolean
  /** A list-bound leave was requested while dirty; the discard dialog is open. */
  isLeavePending: boolean
  openDetail: (file: string | null) => void
  setDirty: (isDirty: boolean) => void
  /**
   * List-bound navigation (breadcrumb root, sidebar category, Cancel):
   * confirm first when dirty, otherwise return to the list directly.
   */
  requestLeave: () => void
  confirmLeave: () => void
  cancelLeave: () => void
  backToList: () => void
}

export const useSubagentDetailStore = create<SubagentDetailState>((set, get) => ({
  view: { kind: 'list' },
  isDirty: false,
  isLeavePending: false,
  openDetail: (file) => set({ view: { kind: 'detail', file }, isDirty: false }),
  setDirty: (isDirty) => set({ isDirty }),
  requestLeave: () =>
    set((state) => (state.isDirty ? { isLeavePending: true } : { view: { kind: 'list' } })),
  confirmLeave: () => get().backToList(),
  cancelLeave: () => set({ isLeavePending: false }),
  backToList: () => set({ view: { kind: 'list' }, isDirty: false, isLeavePending: false }),
}))
