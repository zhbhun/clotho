import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import { Field, FieldGroup, FieldLabel } from '@/shadcn/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shadcn/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/select'
import { Separator } from '@/shadcn/separator'
import { toast } from '@/shadcn/toast'

import { SettingsSection } from '../../../components/settings-section'
import {
  THEME_PRESETS,
  type ThemeColor,
  type ThemePalette,
  type ThemePresetId,
  type ThemeVariant,
  normalizeHexColor,
} from '../../../services/theme-presets'

const COLOR_ROWS = [
  { color: 'accent', labelKey: 'settings.appearance.theme.accent' },
  { color: 'background', labelKey: 'settings.appearance.theme.background' },
  { color: 'foreground', labelKey: 'settings.appearance.theme.foreground' },
] as const

function ThemeBadge({ palette }: { palette: Pick<ThemePalette, 'accent' | 'background'> }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ring-1 ring-foreground/10"
      style={{ backgroundColor: palette.background, color: palette.accent }}
    >
      Aa
    </span>
  )
}

function PresetControl({
  onPresetChange,
  palette,
  title,
  variant,
}: {
  onPresetChange: (preset: ThemePresetId) => void
  palette: ThemePalette
  title: string
  variant: ThemeVariant
}) {
  const { t } = useTranslation()
  const presets = THEME_PRESETS[variant]
  const items = useMemo(
    () => [
      ...(palette.preset === 'custom'
        ? [{ label: t('settings.appearance.theme.custom'), value: 'custom' }]
        : []),
      ...presets.map((preset) => ({ label: preset.name, value: preset.id })),
    ],
    [palette.preset, presets, t],
  )

  return (
    <div className="flex items-center gap-2">
      <ThemeBadge palette={palette} />
      <Select
        items={items}
        value={palette.preset}
        onValueChange={(value) => {
          if (value !== 'custom' && presets.some((preset) => preset.id === value)) {
            onPresetChange(value as ThemePresetId)
          }
        }}
      >
        <SelectTrigger
          aria-label={t('settings.appearance.theme.presetAria', { theme: title })}
          className="w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent glass align="end" alignItemWithTrigger={false}>
          <SelectGroup>
            {palette.preset === 'custom' ? (
              <SelectItem value="custom">
                <ThemeBadge palette={palette} />
                {t('settings.appearance.theme.custom')}
              </SelectItem>
            ) : null}
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                <ThemeBadge palette={preset} />
                {preset.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function ColorControl({
  color,
  label,
  onChange,
  title,
  value,
}: {
  color: ThemeColor
  label: string
  onChange: (value: string) => void
  title: string
  value: string
}) {
  const { t } = useTranslation()
  const generatedId = useId()
  const inputId = `settings-theme-${color}-${generatedId}`
  const [draft, setDraft] = useState(value.toUpperCase())
  const colorInputRef = useRef<HTMLInputElement>(null)
  const ariaLabel = t('settings.appearance.theme.colorAria', { color: label, theme: title })

  useEffect(() => {
    setDraft(value.toUpperCase())
  }, [value])

  const handleBlur = () => {
    const normalized = normalizeHexColor(draft)
    if (normalized) {
      if (normalized === value.toLowerCase()) {
        setDraft(value.toUpperCase())
        return
      }
      onChange(normalized)
      return
    }
    setDraft(value.toUpperCase())
    toast.add({
      id: 'settings-theme-color-error',
      title: t('common.toast.invalidColor'),
      description: t('settings.appearance.theme.invalidColor'),
      type: 'error',
    })
  }

  return (
    <Field className="min-h-16 px-5 py-3.5" orientation="horizontal">
      <FieldLabel className="font-normal" htmlFor={inputId}>
        {label}
      </FieldLabel>
      <InputGroup className="w-40 shrink-0">
        <InputGroupInput
          aria-label={ariaLabel}
          id={inputId}
          spellCheck={false}
          value={draft}
          onBlur={handleBlur}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setDraft(value.toUpperCase())
            }
          }}
        />
        <InputGroupAddon align="inline-start" className="py-0">
          <InputGroupButton
            aria-label={t('settings.appearance.theme.pickerAria', { color: label, theme: title })}
            size="icon-xs"
            onClick={() => colorInputRef.current?.click()}
          >
            <span
              aria-hidden="true"
              className="size-3.5 rounded-full ring-1 ring-foreground/15"
              style={{ backgroundColor: value }}
            />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <input
        aria-hidden="true"
        className="sr-only"
        ref={colorInputRef}
        tabIndex={-1}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

export function ThemePaletteSettings({
  onColorChange,
  onPresetChange,
  palette,
  variant,
}: {
  onColorChange: (color: ThemeColor, value: string) => void
  onPresetChange: (preset: ThemePresetId) => void
  palette: ThemePalette
  variant: ThemeVariant
}) {
  const { t } = useTranslation()
  const title = t(
    variant === 'dark'
      ? 'settings.appearance.theme.darkPalette'
      : 'settings.appearance.theme.lightPalette',
  )

  return (
    <SettingsSection
      action={
        <PresetControl
          onPresetChange={onPresetChange}
          palette={palette}
          title={title}
          variant={variant}
        />
      }
      title={title}
    >
      <Card className="gap-0 py-0">
        <CardHeader className="sr-only">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{t('settings.appearance.theme.description')}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <FieldGroup className="gap-0">
            {COLOR_ROWS.map((row, index) => {
              const label = t(row.labelKey)
              return (
                <Fragment key={row.color}>
                  {index > 0 ? <Separator /> : null}
                  <ColorControl
                    color={row.color}
                    label={label}
                    title={title}
                    value={palette[row.color]}
                    onChange={(value) => onColorChange(row.color, value)}
                  />
                </Fragment>
              )
            })}
          </FieldGroup>
        </CardContent>
      </Card>
    </SettingsSection>
  )
}
