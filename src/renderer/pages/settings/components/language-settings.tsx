import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/shadcn/field'
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
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="sr-only">
          <CardTitle>{t('settings.language.title')}</CardTitle>
          <CardDescription>{t('settings.language.description')}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Field className="min-h-20 px-5 py-4" orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="settings-language">{t('settings.language.title')}</FieldLabel>
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
                className="w-48 self-center"
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
          </Field>
        </CardContent>
      </Card>
    </SettingsSection>
  )
}
