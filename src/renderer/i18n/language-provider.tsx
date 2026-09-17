import type { i18n } from 'i18next'
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { I18nextProvider } from 'react-i18next'

import { toast } from '@/shadcn/toast'

import { loadLanguagePreference, saveLanguagePreference } from '../services/app-settings'
import { syncApplicationMenuLanguage } from '../services/application-menu'
import { type LanguagePreference, resolveLanguagePreference } from './languages'

type LanguageContextValue = {
  preference: LanguagePreference
  setPreference: (preference: LanguagePreference) => void
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : [navigator.language]
}

export function LanguageProvider({
  children,
  getSystemLanguages = browserLanguages,
  initialPreference,
  instance,
}: {
  children: ReactNode
  getSystemLanguages?: () => readonly string[]
  initialPreference: LanguagePreference
  instance: i18n
}) {
  const [preference, setPreference] = useState(initialPreference)
  const applyPreference = useCallback(
    (nextPreference: LanguagePreference, persist: boolean) => {
      const language = resolveLanguagePreference(nextPreference, getSystemLanguages())
      setPreference(nextPreference)
      document.documentElement.lang = language
      void instance.changeLanguage(language)
      syncApplicationMenuLanguage(language)
      if (persist) {
        void saveLanguagePreference(nextPreference).catch(() => {
          const restoredPreference = loadLanguagePreference()
          const restoredLanguage = resolveLanguagePreference(
            restoredPreference,
            getSystemLanguages(),
          )
          setPreference(restoredPreference)
          document.documentElement.lang = restoredLanguage
          void instance.changeLanguage(restoredLanguage)
          syncApplicationMenuLanguage(restoredLanguage)
          toast.add({
            id: 'settings-language-save-error',
            title: instance.t('common.toast.saveFailed'),
            description: instance.t('settings.save.languageError'),
            type: 'error',
          })
        })
      }
    },
    [getSystemLanguages, instance],
  )
  const handlePreferenceChange = useCallback(
    (nextPreference: LanguagePreference) => applyPreference(nextPreference, true),
    [applyPreference],
  )

  useEffect(() => {
    applyPreference(initialPreference, false)
  }, [applyPreference, initialPreference])

  useEffect(() => {
    if (preference !== 'system') return undefined

    const handleLanguageChange = () => applyPreference('system', false)
    window.addEventListener('languagechange', handleLanguageChange)
    return () => window.removeEventListener('languagechange', handleLanguageChange)
  }, [applyPreference, preference])

  const value = useMemo(
    () => ({ preference, setPreference: handlePreferenceChange }),
    [handlePreferenceChange, preference],
  )

  return (
    <I18nextProvider i18n={instance}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider')
  return context
}
