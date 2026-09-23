import {
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  CodeXml,
  FlaskConical,
  Folder,
  FolderCode,
  FolderKanban,
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

const ICONS: Record<ProjectIconName, LucideIcon> = {
  'book-open': BookOpen,
  briefcase: BriefcaseBusiness,
  chart: ChartNoAxesColumnIncreasing,
  'code-xml': CodeXml,
  'flask-conical': FlaskConical,
  folder: Folder,
  'folder-code': FolderCode,
  'folder-kanban': FolderKanban,
  globe: Globe,
  'graduation-cap': GraduationCap,
  heart: Heart,
  music: Music,
  palette: Palette,
  'paw-print': PawPrint,
  'pen-tool': PenTool,
  pencil: Pencil,
  terminal: Terminal,
  wrench: Wrench,
}

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

type PresetProjectIcon = Extract<ProjectIconValue, { type: 'preset' }>

export const DEFAULT_PROJECT_ICON: PresetProjectIcon = {
  type: 'preset',
  name: 'folder-code',
  color: 'neutral',
}

const EMOJI_CHAR_CLASSES = {
  compact: 'text-[10px]',
  small: 'text-base',
  default: 'text-xl',
  large: 'text-2xl',
} as const

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

  if (icon?.type === 'emoji') {
    return (
      <span
        data-slot="project-icon"
        className={cn(
          'flex shrink-0 select-none items-center justify-center',
          containerSizeClass,
          className,
        )}
      >
        <span aria-hidden className={EMOJI_CHAR_CLASSES[size]}>
          {icon.char}
        </span>
      </span>
    )
  }

  // Preset icons can no longer be picked but projects saved by older builds
  // still carry them; anything unknown falls back to the default preset.
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
