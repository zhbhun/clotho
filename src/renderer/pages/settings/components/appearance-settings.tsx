import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/shadcn/field'
import { RadioGroup, RadioGroupItem } from '@/shadcn/radio-group'
import { Separator } from '@/shadcn/separator'
import { Switch } from '@/shadcn/switch'
import { cn } from '@/shadcn/utils'

import { SettingsSection } from '../../../components/settings-section'
import { useTheme } from '../../../components/theme-provider'
import {
  REDUCED_MOTION_PREFERENCES,
  type ReducedMotionPreference,
} from '../../../services/app-settings'
import { ThemePaletteSettings } from './theme-palette-settings'
import { ThemeSettings } from './theme-settings'

const REDUCED_MOTION_OPTIONS = [
  { labelKey: 'common.system', value: 'system' },
  { labelKey: 'common.on', value: 'reduce' },
  { labelKey: 'common.off', value: 'no-preference' },
] as const

function PreferenceRow({
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
    <Field className="min-h-20 px-5 py-4" orientation="horizontal">
      <FieldContent>
        {controlId ? (
          <FieldLabel className="text-sm" htmlFor={controlId}>
            {title}
          </FieldLabel>
        ) : (
          <FieldTitle className="text-sm">{title}</FieldTitle>
        )}
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      {children}
    </Field>
  )
}

function ReducedMotionControl({
  onValueChange,
  value,
}: {
  onValueChange: (value: ReducedMotionPreference) => void
  value: ReducedMotionPreference
}) {
  const { t } = useTranslation()

  return (
    <RadioGroup
      aria-label={t('appearance.reducedMotion.title')}
      className="w-auto grid-cols-3 gap-1 self-center rounded-lg bg-transparent"
      value={value}
      onValueChange={(nextValue) => {
        if (REDUCED_MOTION_PREFERENCES.includes(nextValue as ReducedMotionPreference)) {
          onValueChange(nextValue as ReducedMotionPreference)
        }
      }}
    >
      {REDUCED_MOTION_OPTIONS.map((option) => {
        const id = `settings-reduced-motion-${option.value}`
        const selected = option.value === value

        return (
          <FieldLabel
            className={cn(
              'relative min-w-14 items-center justify-center rounded-md px-3 py-1.5 text-center font-medium transition-colors',
              selected
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
            htmlFor={id}
            key={option.value}
          >
            <RadioGroupItem className="absolute sr-only" id={id} value={option.value} />
            {t(option.labelKey)}
          </FieldLabel>
        )
      })}
    </RadioGroup>
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
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="sr-only">
            <CardTitle>{t('appearance.preferences')}</CardTitle>
            <CardDescription>{t('appearance.description')}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <FieldGroup className="gap-0">
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
              <Separator />
              <PreferenceRow
                description={t('appearance.reducedMotion.description')}
                title={t('appearance.reducedMotion.title')}
              >
                <ReducedMotionControl value={reducedMotion} onValueChange={setReducedMotion} />
              </PreferenceRow>
            </FieldGroup>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  )
}
