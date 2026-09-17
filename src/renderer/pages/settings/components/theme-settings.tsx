import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { Field, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/shadcn/field'
import { RadioGroup, RadioGroupItem } from '@/shadcn/radio-group'
import { cn } from '@/shadcn/utils'

import { SettingsSection } from '../../../components/settings-section'
import type { Theme } from '../../../components/theme-provider'
import type { ThemePalettes } from '../../../services/theme-presets'

const THEME_OPTIONS = [
  { labelKey: 'common.system', value: 'system' },
  { labelKey: 'appearance.theme.light', value: 'light' },
  { labelKey: 'appearance.theme.dark', value: 'dark' },
] as const

const PREVIEW_ROWS = [0, 1, 2] as const

function PreviewLines({ isSplit = false }: { isSplit?: boolean }) {
  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-1.5 px-3">
      {isSplit ? (
        <>
          <div className="flex w-full justify-between gap-3">
            <div className="h-1.5 w-12 max-w-[40%] rounded-full bg-(--preview-line)" />
            <div className="h-1.5 w-12 max-w-[40%] rounded-full bg-(--preview-line)" />
          </div>
          <div className="h-1 w-full rounded-full bg-(--preview-line) opacity-50" />
        </>
      ) : (
        <>
          <div className="h-1.5 w-12 max-w-full rounded-full bg-(--preview-line)" />
          <div className="h-1 w-20 max-w-full rounded-full bg-(--preview-line) opacity-50" />
        </>
      )}
    </div>
  )
}

function ThemeMiniature({
  isFill = false,
  isSplit = false,
  palette,
}: {
  isFill?: boolean
  isSplit?: boolean
  palette: ThemePalettes[keyof ThemePalettes]
}) {
  const style = {
    '--preview-canvas': `color-mix(in oklch, ${palette.background}, ${palette.foreground} 7%)`,
    '--preview-line': `color-mix(in oklch, ${palette.foreground}, transparent 58%)`,
    '--preview-surface': palette.background,
  } as CSSProperties

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden bg-(--preview-canvas)',
        isFill ? 'h-full' : 'h-32 sm:aspect-[10/7] sm:h-auto',
      )}
      style={style}
    >
      <div className="absolute top-5 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-(--preview-line)" />
      <div className="absolute top-8 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-(--preview-line) opacity-60" />
      <div className="absolute inset-x-3 top-12 bottom-0 overflow-hidden rounded-t-xl bg-(--preview-surface)">
        <div className="grid h-full grid-rows-3">
          {PREVIEW_ROWS.map((row) => (
            <div className="relative min-h-0" key={row}>
              <PreviewLines isSplit={isSplit} />
              {row < PREVIEW_ROWS.length - 1 ? (
                <div className="absolute inset-x-0 bottom-0 h-px bg-(--preview-line) opacity-30" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SystemThemeMiniature({ palettes }: { palettes: ThemePalettes }) {
  return (
    <div aria-hidden="true" className="relative h-32 overflow-hidden sm:aspect-[10/7] sm:h-auto">
      <div className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">
        <ThemeMiniature isFill isSplit palette={palettes.light} />
      </div>
      <div className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
        <ThemeMiniature isFill isSplit palette={palettes.dark} />
      </div>
    </div>
  )
}

function ThemePreview({ palettes, theme }: { palettes: ThemePalettes; theme: Theme }) {
  if (theme === 'system') return <SystemThemeMiniature palettes={palettes} />
  return <ThemeMiniature palette={palettes[theme]} />
}

function ThemeOption({
  label,
  palettes,
  selected,
  value,
}: {
  label: string
  palettes: ThemePalettes
  selected: boolean
  value: Theme
}) {
  const id = `settings-theme-${value}`

  return (
    <Field className="min-w-0">
      <RadioGroupItem className="peer sr-only" id={id} value={value} />
      <FieldLabel
        className="w-full flex-col gap-2 peer-focus-visible:[&_[data-theme-preview]]:outline-primary peer-focus-visible:[&_[data-theme-preview]]:ring-2 peer-focus-visible:[&_[data-theme-preview]]:ring-primary/30"
        htmlFor={id}
      >
        <div
          data-theme-preview
          className={cn(
            'w-full overflow-hidden rounded-xl outline-2 outline-offset-0 transition-[outline-color,box-shadow]',
            selected ? 'outline-foreground' : 'outline-transparent',
          )}
        >
          <ThemePreview palettes={palettes} theme={value} />
        </div>
        <FieldTitle
          className={cn(
            'justify-center transition-colors',
            !selected && 'text-muted-foreground group-hover/field-label:text-foreground',
          )}
        >
          {label}
        </FieldTitle>
      </FieldLabel>
    </Field>
  )
}

export function ThemeSettings({
  onThemeChange,
  palettes,
  theme,
}: {
  onThemeChange: (theme: Theme) => void
  palettes: ThemePalettes
  theme: Theme
}) {
  const { t } = useTranslation()

  return (
    <SettingsSection title={t('appearance.theme.title')}>
      <FieldSet>
        <FieldLegend className="sr-only">{t('appearance.theme.title')}</FieldLegend>
        <RadioGroup
          aria-label={t('appearance.theme.title')}
          className="grid-cols-1 gap-3 sm:grid-cols-3"
          value={theme}
          onValueChange={(value) => {
            if (THEME_OPTIONS.some((option) => option.value === value)) {
              onThemeChange(value as Theme)
            }
          }}
        >
          {THEME_OPTIONS.map((option) => (
            <ThemeOption
              key={option.value}
              label={t(option.labelKey)}
              palettes={palettes}
              selected={theme === option.value}
              value={option.value}
            />
          ))}
        </RadioGroup>
      </FieldSet>
    </SettingsSection>
  )
}
