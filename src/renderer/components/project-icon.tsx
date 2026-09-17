import {
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  CodeXml,
  FlaskConical,
  Folder,
  Globe,
  GraduationCap,
  Heart,
  type LucideIcon,
  Music,
  Palette,
  PawPrint,
  PenTool,
  Pencil,
  Terminal,
  Wrench,
} from 'lucide-react'

import { cn } from '@/shadcn/utils'
import type {
  ProjectIconColor,
  ProjectIconName,
  ProjectIcon as ProjectIconValue,
} from '@/shared/rpc'

import type { MessageKey } from '../i18n/resources'

export const PROJECT_ICON_OPTIONS: Array<{
  name: ProjectIconName
  labelKey: MessageKey
  icon: LucideIcon
}> = [
  { name: 'folder', labelKey: 'project.icon.name.folder', icon: Folder },
  { name: 'code-xml', labelKey: 'project.icon.name.code', icon: CodeXml },
  { name: 'terminal', labelKey: 'project.icon.name.terminal', icon: Terminal },
  { name: 'book-open', labelKey: 'project.icon.name.book', icon: BookOpen },
  { name: 'graduation-cap', labelKey: 'project.icon.name.study', icon: GraduationCap },
  { name: 'pencil', labelKey: 'project.icon.name.pencil', icon: Pencil },
  { name: 'pen-tool', labelKey: 'project.icon.name.design', icon: PenTool },
  { name: 'music', labelKey: 'project.icon.name.music', icon: Music },
  { name: 'palette', labelKey: 'project.icon.name.creative', icon: Palette },
  { name: 'briefcase', labelKey: 'project.icon.name.briefcase', icon: BriefcaseBusiness },
  { name: 'chart', labelKey: 'project.icon.name.chart', icon: ChartNoAxesColumnIncreasing },
  { name: 'globe', labelKey: 'project.icon.name.web', icon: Globe },
  { name: 'wrench', labelKey: 'project.icon.name.tools', icon: Wrench },
  { name: 'heart', labelKey: 'project.icon.name.favorite', icon: Heart },
  { name: 'flask-conical', labelKey: 'project.icon.name.experiment', icon: FlaskConical },
  { name: 'paw-print', labelKey: 'project.icon.name.pet', icon: PawPrint },
]

export const PROJECT_ICON_COLORS: Array<{ color: ProjectIconColor; labelKey: MessageKey }> = [
  { color: 'neutral', labelKey: 'project.icon.color.neutral' },
  { color: 'red', labelKey: 'project.icon.color.red' },
  { color: 'orange', labelKey: 'project.icon.color.orange' },
  { color: 'amber', labelKey: 'project.icon.color.amber' },
  { color: 'green', labelKey: 'project.icon.color.green' },
  { color: 'blue', labelKey: 'project.icon.color.blue' },
  { color: 'violet', labelKey: 'project.icon.color.violet' },
  { color: 'pink', labelKey: 'project.icon.color.pink' },
]

const ICONS = Object.fromEntries(
  PROJECT_ICON_OPTIONS.map((option) => [option.name, option.icon]),
) as Record<ProjectIconName, LucideIcon>

const COLOR_CLASSES: Record<ProjectIconColor, string> = {
  neutral: 'bg-muted text-foreground-subtle',
  red: 'bg-project-icon-red/10 text-project-icon-red',
  orange: 'bg-project-icon-orange/10 text-project-icon-orange',
  amber: 'bg-project-icon-amber/10 text-project-icon-amber',
  green: 'bg-project-icon-green/10 text-project-icon-green',
  blue: 'bg-project-icon-blue/10 text-project-icon-blue',
  violet: 'bg-project-icon-violet/10 text-project-icon-violet',
  pink: 'bg-project-icon-pink/10 text-project-icon-pink',
}

export const PROJECT_ICON_SWATCH_CLASSES: Record<ProjectIconColor, string> = {
  neutral: 'bg-foreground',
  red: 'bg-project-icon-red',
  orange: 'bg-project-icon-orange',
  amber: 'bg-project-icon-amber',
  green: 'bg-project-icon-green',
  blue: 'bg-project-icon-blue',
  violet: 'bg-project-icon-violet',
  pink: 'bg-project-icon-pink',
}

type PresetProjectIcon = Extract<ProjectIconValue, { type: 'preset' }>

export const DEFAULT_PROJECT_ICON: PresetProjectIcon = {
  type: 'preset',
  name: 'folder',
  color: 'neutral',
}

export function ProjectIcon({
  className,
  icon,
  plain = false,
  size = 'default',
}: {
  className?: string
  icon?: ProjectIconValue
  plain?: boolean
  size?: 'compact' | 'small' | 'default' | 'large'
}) {
  const graphicSizeClass =
    size === 'compact'
      ? 'size-3!'
      : size === 'small'
        ? 'size-3.5'
        : size === 'large'
          ? plain
            ? 'size-6'
            : 'size-5'
          : 'size-4'
  const containerSizeClass =
    size === 'compact'
      ? 'size-3'
      : size === 'small'
        ? 'size-7'
        : size === 'large'
          ? 'size-10'
          : 'size-8'

  if (icon?.type === 'custom') {
    return (
      <span
        data-slot="project-icon"
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-md',
          containerSizeClass,
          className,
        )}
      >
        <img alt="" className={cn('object-cover', graphicSizeClass)} src={icon.dataUrl} />
      </span>
    )
  }

  const preset = icon?.type === 'preset' ? icon : DEFAULT_PROJECT_ICON
  const Icon = ICONS[preset.name]
  return (
    <span
      data-slot="project-icon"
      className={cn(
        'flex shrink-0 items-center justify-center',
        containerSizeClass,
        COLOR_CLASSES[preset.color],
        plain ? 'rounded-none bg-transparent' : 'rounded-md',
        className,
      )}
    >
      <Icon className={graphicSizeClass} />
    </span>
  )
}
