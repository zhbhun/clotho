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
  /** Unchecked chip styling for the settings radio rows: tinted icon, no fill. */
  iconClassName: string
  /** Chip fill when checked (plain class). */
  checkedIconClassName: string
  /** Chip fill on row hover (row group-scoped; spelled out for Tailwind). */
  hoverIconClassName: string
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
    iconClassName: 'text-sky-600 dark:text-sky-400',
    checkedIconClassName: 'bg-sky-500/10',
    hoverIconClassName: 'group-hover/settings-row:bg-sky-500/10',
  },
  {
    value: 'acceptEdits',
    labelKey: 'permission.mode.acceptEdits.title',
    descriptionKey: 'permission.mode.acceptEdits.description',
    icon: ShieldCheck,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    checkedIconClassName: 'bg-emerald-500/10',
    hoverIconClassName: 'group-hover/settings-row:bg-emerald-500/10',
  },
  {
    value: 'auto',
    labelKey: 'permission.mode.auto.title',
    descriptionKey: 'permission.mode.auto.description',
    icon: Sparkles,
    iconClassName: 'text-violet-600 dark:text-violet-400',
    checkedIconClassName: 'bg-violet-500/10',
    hoverIconClassName: 'group-hover/settings-row:bg-violet-500/10',
  },
  {
    value: 'plan',
    labelKey: 'permission.mode.plan.title',
    descriptionKey: 'permission.mode.plan.description',
    icon: ClipboardList,
    iconClassName: 'text-amber-600 dark:text-amber-400',
    checkedIconClassName: 'bg-amber-500/10',
    hoverIconClassName: 'group-hover/settings-row:bg-amber-500/10',
  },
  {
    value: 'bypassPermissions',
    labelKey: 'permission.mode.bypassPermissions.title',
    descriptionKey: 'permission.mode.bypassPermissions.description',
    icon: ShieldAlert,
    iconClassName: 'text-rose-600 dark:text-rose-400',
    checkedIconClassName: 'bg-rose-500/10',
    hoverIconClassName: 'group-hover/settings-row:bg-rose-500/10',
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
