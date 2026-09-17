import {
  ClipboardList,
  Hand,
  type LucideIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import type { MessageKey } from '../i18n/resources'
import {
  CONFIGURABLE_PERMISSION_MODES,
  type ConfigurablePermissionMode,
} from '../services/app-settings'
import type { ClaudePermissionMode } from '../services/claude/claude'

export type PermissionModeOption = {
  value: ConfigurablePermissionMode
  labelKey: MessageKey
  descriptionKey: MessageKey
  icon: LucideIcon
  /** Chip styling for the settings radio cards. */
  iconClassName: string
  /** Chip styling when its radio card is checked. */
  checkedIconClassName: string
  /** Trigger accent for elevated-risk modes in the composer switcher. */
  accentClassName?: string
}

/** The permission modes Claude supports, in escalation order. */
export const PERMISSION_MODE_OPTIONS: PermissionModeOption[] = [
  {
    value: 'default',
    labelKey: 'permission.mode.default.title',
    descriptionKey: 'permission.mode.default.description',
    icon: Hand,
    iconClassName: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    checkedIconClassName: 'bg-sky-500 text-white',
  },
  {
    value: 'acceptEdits',
    labelKey: 'permission.mode.acceptEdits.title',
    descriptionKey: 'permission.mode.acceptEdits.description',
    icon: ShieldCheck,
    iconClassName: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    checkedIconClassName: 'bg-emerald-500 text-white',
  },
  {
    value: 'auto',
    labelKey: 'permission.mode.auto.title',
    descriptionKey: 'permission.mode.auto.description',
    icon: Sparkles,
    iconClassName: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    checkedIconClassName: 'bg-violet-500 text-white',
  },
  {
    value: 'plan',
    labelKey: 'permission.mode.plan.title',
    descriptionKey: 'permission.mode.plan.description',
    icon: ClipboardList,
    iconClassName: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    checkedIconClassName: 'bg-amber-500 text-white',
  },
  {
    value: 'bypassPermissions',
    labelKey: 'permission.mode.bypassPermissions.title',
    descriptionKey: 'permission.mode.bypassPermissions.description',
    icon: ShieldAlert,
    iconClassName: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    checkedIconClassName: 'bg-rose-500 text-white',
    accentClassName: 'text-orange-400 dark:text-orange-300',
  },
]

export function permissionModeOption(mode: ClaudePermissionMode): PermissionModeOption {
  return (
    PERMISSION_MODE_OPTIONS.find((option) => option.value === mode) ?? PERMISSION_MODE_OPTIONS[0]
  )
}

export function isConfigurablePermissionMode(value: unknown): value is ConfigurablePermissionMode {
  return CONFIGURABLE_PERMISSION_MODES.includes(value as ConfigurablePermissionMode)
}
