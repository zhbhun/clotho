import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FieldContent, FieldDescription, FieldLabel } from '@/shadcn/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/select'

import { SettingsSection } from '../../../components/settings-section'
import { useLanguage } from '../../../i18n/language-provider'
import { LANGUAGE_PREFERENCES, type LanguagePreference } from '../../../i18n/languages'
import { SettingsList, SettingsRow } from './settings-list'

const LANGUAGE_NAMES: Record<Exclude<LanguagePreference, 'system'>, string> = {
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  ja: '日本語',
  ko: '한국어',
  'pt-BR': 'Português (Brasil)',
  ru: 'Русский',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

export function LanguageSettings() {
  const { t } = useTranslation()
  const { preference, setPreference } = useLanguage()
  const items = useMemo(
    () =>
      LANGUAGE_PREFERENCES.map((value) => ({
        label: value === 'system' ? t('settings.language.followSystem') : LANGUAGE_NAMES[value],
        value,
      })),
    [t],
  )

  return (
    <SettingsSection title={t('settings.language.title')}>
      <SettingsList>
        <SettingsRow>
          <FieldContent>
            <FieldLabel className="font-normal" htmlFor="settings-language">
              {t('settings.language.title')}
            </FieldLabel>
            <FieldDescription>{t('settings.language.description')}</FieldDescription>
          </FieldContent>
          <Select
            items={items}
            value={preference}
            onValueChange={(value) => {
              if (LANGUAGE_PREFERENCES.includes(value as LanguagePreference)) {
                setPreference(value as LanguagePreference)
              }
            }}
          >
            <SelectTrigger
              aria-label={t('settings.language.title')}
              className="max-w-62.5 min-w-0 self-center"
              id="settings-language"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent glass alignItemWithTrigger={false} align="end">
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsList>
    </SettingsSection>
  )
}
