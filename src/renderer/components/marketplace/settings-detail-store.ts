import { type ReactNode, createContext, createElement, useContext, useState } from 'react'
import { create, useStore } from 'zustand'

import type { MarketSkill } from '@/shared/rpc'

export type SettingsCategoryId =
  | 'general'
  | 'models'
  | 'appearance'
  | 'shortcuts'
  | 'projects'
  | 'agent-marketplace'
  | 'agent-plugins'
  | 'agent-subagents'
  | 'agent-mcp'
  | 'agent-skills'

/** Second-level pages reachable from a category list. */
export type DetailPage =
  'entry' | 'marketplaces' | 'install' | 'install-section' | 'skill-section' | 'skills'
/** Third-level subpages openable under a second-level page. */
export type DetailSubPage = 'add' | 'market-detail' | 'install-detail' | 'skill-detail'

/**
 * Which view the settings content pane shows: a category's list, or a detail
 * page within one category. A detail page is `page` plus an optional `sub`
 * (the third level, e.g. Add marketplace under the Marketplaces page). One
 * detail page is open at a time across all categories (design D1); a `sub`
 * exists only while its `page` is open.
 */
export type SettingsDetailView =
  | {
      kind: 'detail'
      categoryId: SettingsCategoryId
      /** Identifies the entry being edited; `null` when creating. */
      file: string | null
      marketSkill?: MarketSkill
      /** The second-level page the detail belongs to. */
      page: DetailPage
      /** Third-level payload: which subpage and its entry id (null = create). */
      sub: { page: DetailSubPage; file: string | null; marketSkill?: MarketSkill } | null
    }
  | { kind: 'list' }

interface SettingsDetailState {
  view: SettingsDetailView
  /**
   * The breadcrumb leaf text for the open detail page (item name or the
   * localized create label); the editor keeps it current as fields change.
   * With a third level open, `subLeaf` holds that level's leaf.
   */
  leaf: string
  subLeaf: string
  /** The detail form has unsaved changes; list-bound navigation must confirm. */
  isDirty: boolean
  /** A list-bound leave was requested while dirty; the discard dialog is open. */
  isLeavePending: boolean
  /** Open a detail page; pass `page` to land on a second-level page directly. */
  openDetail: (
    categoryId: SettingsCategoryId,
    file: string | null,
    leaf: string,
    page?: Exclude<DetailPage, 'entry'>,
    marketSkill?: MarketSkill,
  ) => void
  /**
   * Open a third-level subpage under the currently open second-level page.
   * No-op unless a detail page of the same category is already open.
   */
  openSub: (
    categoryId: SettingsCategoryId,
    page: DetailSubPage,
    file: string | null,
    leaf: string,
    marketSkill?: MarketSkill,
  ) => void
  /** Switch to another second-level page within the open detail. */
  setPage: (page: Exclude<DetailPage, 'entry'>, leaf: string, file?: string | null) => void
  setLeaf: (leaf: string) => void
  setSubLeaf: (leaf: string) => void
  setDirty: (isDirty: boolean) => void
  /**
   * List-bound navigation (breadcrumb segment, sidebar category, Cancel):
   * confirm first when dirty, otherwise walk one level up — from the third
   * level to its parent page, from the second level to the list.
   */
  requestLeave: () => void
  confirmLeave: () => void
  cancelLeave: () => void
  backToList: () => void
}

const LIST_VIEW: SettingsDetailView = { kind: 'list' }

const createDetailStore = () =>
  create<SettingsDetailState>((set) => ({
    view: LIST_VIEW,
    leaf: '',
    subLeaf: '',
    isDirty: false,
    isLeavePending: false,
    openDetail: (categoryId, file, leaf, page, marketSkill) =>
      set({
        view: { kind: 'detail', categoryId, file, marketSkill, page: page ?? 'entry', sub: null },
        leaf,
        subLeaf: '',
        isDirty: false,
        isLeavePending: false,
      }),
    openSub: (categoryId, page, file, leaf, marketSkill) =>
      set((state) => {
        if (state.view.kind !== 'detail' || state.view.categoryId !== categoryId) return state
        return {
          view: { ...state.view, sub: { page, file, marketSkill } },
          subLeaf: leaf,
          isDirty: false,
          isLeavePending: false,
        }
      }),
    setPage: (page, leaf, file = null) =>
      set((state) => {
        if (state.view.kind !== 'detail') return state
        return { view: { ...state.view, page, file, sub: null }, leaf, subLeaf: '' }
      }),
    setLeaf: (leaf) => set((state) => (state.leaf === leaf ? state : { leaf })),
    setSubLeaf: (subLeaf) => set((state) => (state.subLeaf === subLeaf ? state : { subLeaf })),
    // Skip no-op updates: editors re-report dirty on every render via an
    // inline form value, and a state change would re-render and loop.
    setDirty: (isDirty) => set((state) => (state.isDirty === isDirty ? state : { isDirty })),
    requestLeave: () =>
      set((state) => {
        if (state.isDirty) return { isLeavePending: true }
        if (state.view.kind !== 'detail') return { view: LIST_VIEW, leaf: '' }
        if (state.view.sub)
          return { view: { ...state.view, sub: null }, subLeaf: '', isDirty: false }
        return { view: LIST_VIEW, leaf: '', subLeaf: '' }
      }),
    confirmLeave: () =>
      set((state) => {
        if (state.view.kind !== 'detail')
          return { view: LIST_VIEW, leaf: '', isDirty: false, isLeavePending: false }
        if (state.view.sub)
          return {
            view: { ...state.view, sub: null },
            subLeaf: '',
            isDirty: false,
            isLeavePending: false,
          }
        return { view: LIST_VIEW, leaf: '', subLeaf: '', isDirty: false, isLeavePending: false }
      }),
    cancelLeave: () => set({ isLeavePending: false }),
    backToList: () =>
      set({ view: LIST_VIEW, leaf: '', subLeaf: '', isDirty: false, isLeavePending: false }),
  }))

const defaultStore = createDetailStore()
const DetailStoreContext = createContext<ReturnType<typeof createDetailStore> | null>(null)

/** Give an independently mounted market its own navigation and unsaved form state. */
export function DetailStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDetailStore)
  return createElement(DetailStoreContext.Provider, { value: store }, children)
}

function useDetailStore(): SettingsDetailState
function useDetailStore<T>(selector: (state: SettingsDetailState) => T): T
function useDetailStore<T>(selector?: (state: SettingsDetailState) => T) {
  const store = useContext(DetailStoreContext) ?? defaultStore
  return useStore(store, selector ?? ((state) => state as T))
}

export const useSettingsDetailStore = Object.assign(useDetailStore, defaultStore)
