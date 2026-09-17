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

function PermissionOption({
  description,
  icon: Icon,
  iconClassName,
  isChecked,
  checkedIconClassName,
  label,
  value,
}: {
  description?: string
  icon: LucideIcon
  iconClassName: string
  isChecked: boolean
  checkedIconClassName: string
  label: string
  value: string
}) {
  const id = `settings-permission-${value}`

  return (
    <FieldLabel
      className={cn(
        'relative w-full cursor-pointer items-center gap-3 rounded-xl border bg-background px-3.5 py-3 transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
        isChecked
          ? 'border-foreground/25 bg-muted/40 has-data-checked:bg-muted/40 dark:has-data-checked:bg-muted/40'
          : 'border-border/60 hover:border-border hover:bg-muted/40',
      )}
      htmlFor={id}
    >
      <RadioGroupItem className="absolute opacity-0" id={id} value={value} />
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
          iconClassName,
          isChecked && checkedIconClassName,
        )}
      >
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <FieldContent className="min-w-0 gap-0.5">
        <FieldTitle className="text-sm">{label}</FieldTitle>
        {description ? (
          <FieldDescription className="line-clamp-2">{description}</FieldDescription>
        ) : null}
      </FieldContent>
      <Check
        className={cn(
          'size-4 shrink-0 transition-opacity',
          isChecked ? 'text-foreground-subtle' : 'invisible opacity-0',
        )}
        strokeWidth={2}
      />
    </FieldLabel>
  )
}

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
          className="gap-2"
          value={permissionMode}
          onValueChange={handlePermissionModeChange}
        >
          {PERMISSION_MODE_OPTIONS.map((option) => (
            <PermissionOption
              description={t(option.descriptionKey)}
              key={option.value}
              icon={option.icon}
              iconClassName={option.iconClassName}
              isChecked={permissionMode === option.value}
              checkedIconClassName={option.checkedIconClassName}
              label={t(option.labelKey)}
              value={option.value}
            />
          ))}
        </RadioGroup>
      </FieldSet>
    </SettingsSection>
  )
}
