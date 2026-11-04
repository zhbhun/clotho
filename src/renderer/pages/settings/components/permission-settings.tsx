import { Check, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/shadcn/field'
import { RadioGroup, RadioGroupItem } from '@/shadcn/radio-group'
import { toast } from '@/shadcn/toast'
import { cn } from '@/shadcn/utils'

import { PERMISSION_MODE_OPTIONS } from '../../../components/permission-mode'
import { SettingsSection } from '../../../components/settings-section'
import {
  type ConfigurablePermissionMode,
  loadDefaultPermissionMode,
  saveDefaultPermissionMode,
} from '../../../services/app-settings'
import { SettingsList, SettingsRow, markAsRow } from './settings-list'

const PermissionOption = markAsRow(function PermissionOption({
  description,
  icon: Icon,
  iconClassName,
  isChecked,
  checkedIconClassName,
  hoverIconClassName,
  label,
  value,
}: {
  description?: string
  icon: LucideIcon
  iconClassName: string
  isChecked: boolean
  checkedIconClassName: string
  hoverIconClassName: string
  label: string
  value: string
}) {
  const id = `settings-permission-${value}`

  // The row is one big radio label with the radio visually hidden: selection
  // shows through the icon chip's tinted fill and the title color shift on
  // hover. FieldLabel's own has-data-checked wash is suppressed so it doesn't
  // read as a phantom selection on top of the row.
  return (
    <SettingsRow className="py-3" variant="compact">
      <FieldLabel
        className="relative w-full cursor-pointer items-center gap-3 has-data-checked:bg-transparent dark:has-data-checked:bg-transparent"
        htmlFor={id}
      >
        <RadioGroupItem className="absolute opacity-0" id={id} value={value} />
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            iconClassName,
            // checkedIconClassName carries only the chip fill: always on when
            // checked, row-hover-scoped otherwise (the option data spells the
            // group-hover variant out so Tailwind compiles it).
            isChecked ? checkedIconClassName : hoverIconClassName,
          )}
        >
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <FieldContent className="min-w-0 gap-0.5">
          <FieldTitle
            className={cn(
              'font-normal transition-colors',
              !isChecked && 'text-foreground-subtlest group-hover/settings-row:text-foreground',
            )}
          >
            {label}
          </FieldTitle>
          {description ? (
            <FieldDescription className="line-clamp-2">{description}</FieldDescription>
          ) : null}
        </FieldContent>
        <Check
          className={cn(
            'size-4 shrink-0 transition-opacity',
            isChecked ? 'text-foreground' : 'invisible opacity-0',
          )}
          strokeWidth={2}
        />
      </FieldLabel>
    </SettingsRow>
  )
})

export function PermissionSettings() {
  const { t } = useTranslation()
  const [permissionMode, setPermissionMode] = useState<ConfigurablePermissionMode>(() =>
    loadDefaultPermissionMode(),
  )

  function handlePermissionModeChange(value: string) {
    const nextMode = PERMISSION_MODE_OPTIONS.find((option) => option.value === value)
    if (!nextMode) return
    setPermissionMode(nextMode.value)
    void saveDefaultPermissionMode(nextMode.value).catch(() => {
      setPermissionMode(loadDefaultPermissionMode())
      toast.add({
        id: 'settings-permission-save-error',
        title: t('common.toast.saveFailed'),
        description: t('settings.save.permissionError'),
        type: 'error',
      })
    })
  }

  return (
    <SettingsSection title={t('permission.title')}>
      <FieldSet className="gap-3">
        <FieldLegend className="sr-only">{t('permission.default.title')}</FieldLegend>
        <FieldDescription className="pb-1">{t('permission.default.description')}</FieldDescription>
        <RadioGroup
          aria-label={t('permission.default.title')}
          className="gap-0"
          value={permissionMode}
          onValueChange={handlePermissionModeChange}
        >
          <SettingsList>
            {PERMISSION_MODE_OPTIONS.map((option) => (
              <PermissionOption
                description={t(option.descriptionKey)}
                key={option.value}
                icon={option.icon}
                iconClassName={option.iconClassName}
                isChecked={permissionMode === option.value}
                checkedIconClassName={option.checkedIconClassName}
                hoverIconClassName={option.hoverIconClassName}
                label={t(option.labelKey)}
                value={option.value}
              />
            ))}
          </SettingsList>
        </RadioGroup>
      </FieldSet>
    </SettingsSection>
  )
}
