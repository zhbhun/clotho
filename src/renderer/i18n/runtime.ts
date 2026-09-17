import { type InitOptions, createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'

import {
  LANGUAGE_PREFERENCES,
  type LanguagePreference,
  resolveLanguagePreference,
} from './languages'
import { translationResources } from './resources'

function initOptions(
  preference: LanguagePreference,
  systemLanguages: readonly string[],
): InitOptions {
  return {
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
    lng: resolveLanguagePreference(preference, systemLanguages),
    resources: translationResources,
    supportedLngs: LANGUAGE_PREFERENCES.filter((language) => language !== 'system'),
  }
}

export const appI18n = createInstance().use(initReactI18next)

export async function createAppI18n(
  preference: LanguagePreference,
  systemLanguages: readonly string[],
) {
  const instance = createInstance()
  await instance.init(initOptions(preference, systemLanguages))
  return instance
}

export async function initializeAppI18n(
  preference: LanguagePreference,
  systemLanguages: readonly string[],
) {
  await appI18n.init(initOptions(preference, systemLanguages))
  return appI18n
}
