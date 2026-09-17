import type { SupportedLanguage } from './languages'

export type TranslationRow = Record<SupportedLanguage, string>

export function messages(
  en: string,
  zhCN: string,
  zhTW: string,
  ja: string,
  ko: string,
  es: string,
  fr: string,
  de: string,
  ptBR: string,
  ru: string,
  hi: string,
  id: string,
  tr: string,
  vi: string,
): TranslationRow {
  return {
    de,
    en,
    es,
    fr,
    hi,
    id,
    ja,
    ko,
    'pt-BR': ptBR,
    ru,
    tr,
    vi,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
  }
}
