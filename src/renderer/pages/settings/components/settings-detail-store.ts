import { create } from 'zustand'

import type { SettingsCategoryId } from '../index'

/**
 * Which view the settings content pane shows: a category's list, or the
 * second-level detail page for one entry (`file`, or `null` when creating).
 * One detail page is open at a time across all categories (design D1).
 */
export type SettingsDetailView =
  | {
      kind: 'detail'
      categoryId: SettingsCategoryId
      /** Identifies the entry being edited; `null` when creating. */
      file: string | null
    }
  | { kind: 'list' }

interface SettingsDetailState {
  view: SettingsDetailView
  /**
   * The breadcrumb leaf text for the open detail page (item name or the
   * localized create label); the editor keeps it current as fields change.
   */
  leaf: string
  /** The detail form has unsaved changes; list-bound navigation must confirm. */
  isDirty: boolean
  /** A list-bound leave was requested while dirty; the discard dialog is open. */
  isLeavePending: boolean
  openDetail: (categoryId: SettingsCategoryId, file: string | null, leaf: string) => void
  setLeaf: (leaf: string) => void
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

const LIST_VIEW: SettingsDetailView = { kind: 'list' }

export const useSettingsDetailStore = create<SettingsDetailState>((set) => ({
  view: LIST_VIEW,
  leaf: '',
  isDirty: false,
  isLeavePending: false,
  openDetail: (categoryId, file, leaf) =>
    set({
      view: { kind: 'detail', categoryId, file },
      leaf,
      isDirty: false,
      isLeavePending: false,
    }),
  setLeaf: (leaf) => set((state) => (state.leaf === leaf ? state : { leaf })),
  // Skip no-op updates: editors re-report dirty on every render via an
  // inline form value, and a state change would re-render and loop.
  setDirty: (isDirty) => set((state) => (state.isDirty === isDirty ? state : { isDirty })),
  requestLeave: () =>
    set((state) => (state.isDirty ? { isLeavePending: true } : { view: LIST_VIEW, leaf: '' })),
  confirmLeave: () => set({ view: LIST_VIEW, leaf: '', isDirty: false, isLeavePending: false }),
  cancelLeave: () => set({ isLeavePending: false }),
  backToList: () => set({ view: LIST_VIEW, leaf: '', isDirty: false, isLeavePending: false }),
}))
