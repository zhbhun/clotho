import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/shadcn/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/select'
import { Switch } from '@/shadcn/switch'

import { SettingsSection } from '../../../components/settings-section'
import { useTheme } from '../../../components/theme-provider'
import {
  REDUCED_MOTION_PREFERENCES,
  type ReducedMotionPreference,
} from '../../../services/app-settings'
import { SettingsList, SettingsRow, markAsRow } from './settings-list'
import { ThemePaletteSettings } from './theme-palette-settings'
import { ThemeSettings } from './theme-settings'

const REDUCED_MOTION_OPTIONS = [
  { labelKey: 'common.system', value: 'system' },
  { labelKey: 'common.on', value: 'reduce' },
  { labelKey: 'common.off', value: 'no-preference' },
] as const

const PreferenceRow = markAsRow(function PreferenceRow({
  children,
  controlId,
  description,
  title,
}: {
  children: ReactNode
  controlId?: string
  description: string
  title: string
}) {
  return (
    <SettingsRow>
      <FieldContent>
        {controlId ? (
          <FieldLabel className="font-normal" htmlFor={controlId}>
            {title}
          </FieldLabel>
        ) : (
          <FieldTitle className="font-normal">{title}</FieldTitle>
        )}
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      {children}
    </SettingsRow>
  )
})

function ReducedMotionControl({
  onValueChange,
  value,
}: {
  onValueChange: (value: ReducedMotionPreference) => void
  value: ReducedMotionPreference
}) {
  const { t } = useTranslation()
  const items = useMemo(
    () =>
      REDUCED_MOTION_OPTIONS.map((option) => ({
        label: t(option.labelKey),
        value: option.value,
      })),
    [t],
  )

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(nextValue) => {
        if (REDUCED_MOTION_PREFERENCES.includes(nextValue as ReducedMotionPreference)) {
          onValueChange(nextValue as ReducedMotionPreference)
        }
      }}
    >
      <SelectTrigger
        aria-label={t('appearance.reducedMotion.title')}
        className="max-w-62.5 min-w-0 self-center"
        id="settings-reduced-motion"
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
  )
}

export function AppearanceSettings() {
  const { t } = useTranslation()
  const {
    pointerCursor,
    reducedMotion,
    setPointerCursor,
    setReducedMotion,
    setTheme,
    setThemeColor,
    setThemePreset,
    theme,
    themePalettes,
  } = useTheme()

  return (
    <div className="flex flex-col gap-8">
      <ThemeSettings palettes={themePalettes} theme={theme} onThemeChange={setTheme} />
      {theme !== 'light' ? (
        <ThemePaletteSettings
          palette={themePalettes.dark}
          variant="dark"
          onColorChange={(color, value) => setThemeColor('dark', color, value)}
          onPresetChange={(preset) => setThemePreset('dark', preset)}
        />
      ) : null}
      {theme !== 'dark' ? (
        <ThemePaletteSettings
          palette={themePalettes.light}
          variant="light"
          onColorChange={(color, value) => setThemeColor('light', color, value)}
          onPresetChange={(preset) => setThemePreset('light', preset)}
        />
      ) : null}

      <SettingsSection title={t('appearance.preferences')}>
        <SettingsList>
          <PreferenceRow
            controlId="settings-pointer-cursor"
            description={t('appearance.pointer.description')}
            title={t('appearance.pointer.title')}
          >
            <Switch
              aria-label={t('appearance.pointer.title')}
              checked={pointerCursor}
              className="self-center"
              id="settings-pointer-cursor"
              onCheckedChange={setPointerCursor}
            />
          </PreferenceRow>
          <PreferenceRow
            controlId="settings-reduced-motion"
            description={t('appearance.reducedMotion.description')}
            title={t('appearance.reducedMotion.title')}
          >
            <ReducedMotionControl value={reducedMotion} onValueChange={setReducedMotion} />
          </PreferenceRow>
        </SettingsList>
      </SettingsSection>
    </div>
  )
}
