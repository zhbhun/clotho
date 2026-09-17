import type { AppLanguage } from '@/shared/rpc'

export const LANGUAGE_PREFERENCES = [
  'system',
  'en',
  'zh-CN',
  'zh-TW',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt-BR',
  'ru',
  'hi',
  'id',
  'tr',
  'vi',
] as const

export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number]
export type SupportedLanguage = AppLanguage

const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>(
  LANGUAGE_PREFERENCES.filter(
    (preference): preference is SupportedLanguage => preference !== 'system',
  ),
)

function matchLanguage(language: string): SupportedLanguage | undefined {
  const normalized = language.trim().replaceAll('_', '-').toLowerCase()
  if (!normalized) return undefined

  for (const supported of SUPPORTED_LANGUAGES) {
    if (supported.toLowerCase() === normalized) return supported
  }

  const [base] = normalized.split('-')
  if (base === 'zh') {
    return /(?:^|-)hant(?:-|$)|(?:^|-)(?:hk|mo|tw)(?:-|$)/.test(normalized) ? 'zh-TW' : 'zh-CN'
  }
  if (base === 'pt') return 'pt-BR'

  return SUPPORTED_LANGUAGES.has(base as SupportedLanguage)
    ? (base as SupportedLanguage)
    : undefined
}

export function resolveSystemLanguage(languages: readonly string[]): SupportedLanguage {
  for (const language of languages) {
    const matched = matchLanguage(language)
    if (matched) return matched
  }
  return 'en'
}

export function resolveLanguagePreference(
  preference: LanguagePreference,
  systemLanguages: readonly string[],
): SupportedLanguage {
  return preference === 'system' ? resolveSystemLanguage(systemLanguages) : preference
}
