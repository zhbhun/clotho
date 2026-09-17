import { type ReactNode, createContext, useContext, useState } from 'react'
import { useStore } from 'zustand'

import {
  type ProviderUsageState,
  type ProviderUsageStore,
  createProviderUsageStore,
} from './provider-usage-store'

const ProviderUsageContext = createContext<ProviderUsageStore | null>(null)

export function ProviderUsageProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createProviderUsageStore)

  return <ProviderUsageContext.Provider value={store}>{children}</ProviderUsageContext.Provider>
}

export function useProviderUsageStoreApi() {
  const store = useContext(ProviderUsageContext)
  if (!store) {
    throw new Error('useProviderUsageStoreApi must be used inside ProviderUsageProvider')
  }
  return store
}

export function useProviderUsageStore<T>(selector: (state: ProviderUsageState) => T): T {
  return useStore(useProviderUsageStoreApi(), selector)
}
