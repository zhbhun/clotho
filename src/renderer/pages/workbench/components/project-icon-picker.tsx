import { ImagePlus } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/popover'
import { Separator } from '@/shadcn/separator'
import { toast } from '@/shadcn/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'
import type {
  ProjectIconColor,
  ProjectIconName,
  ProjectIcon as ProjectIconValue,
} from '@/shared/rpc'

import {
  PROJECT_ICON_COLORS,
  PROJECT_ICON_OPTIONS,
  PROJECT_ICON_SWATCH_CLASSES,
  ProjectIcon,
} from '../../../components/project-icon'
import type { MessageKey } from '../../../i18n/resources'
import {
  ProjectImageError,
  type ProjectImageErrorCode,
  projectIconDataUrlFromFile,
} from '../../../utils/project-image'

const PROJECT_IMAGE_ERROR_KEYS = {
  'png-unavailable': 'project.error.image.pngUnavailable',
  'processing-unavailable': 'project.error.image.processingUnavailable',
  'too-large': 'project.error.image.tooLarge',
  unreadable: 'project.error.image.unreadable',
  'unsupported-type': 'project.error.image.unsupportedType',
} satisfies Record<ProjectImageErrorCode, MessageKey>

export function IconPicker({
  disabled,
  value,
  onChange,
  onProcessingChange,
}: {
  disabled: boolean
  value?: ProjectIconValue
  onChange: (value: ProjectIconValue) => void
  onProcessingChange: (processing: boolean) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setOpen] = useState(false)
  const presetColor = value?.type === 'preset' ? value.color : 'neutral'

  function handlePreset(name: ProjectIconName) {
    onChange({ type: 'preset', name, color: presetColor })
  }

  function handleColor(color: ProjectIconColor) {
    onChange({
      type: 'preset',
      name: value?.type === 'preset' ? value.name : 'folder',
      color,
    })
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    onProcessingChange(true)
    try {
      onChange({ type: 'custom', dataUrl: await projectIconDataUrlFromFile(file) })
      setOpen(false)
    } catch (caught) {
      const message =
        caught instanceof ProjectImageError
          ? t(PROJECT_IMAGE_ERROR_KEYS[caught.code])
          : t('project.error.processImage')
      toast.add({ title: message, type: 'error' })
    } finally {
      onProcessingChange(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        accept="image/png,image/jpeg,image/webp"
        aria-label={t('project.icon.custom')}
        className="hidden"
        disabled={disabled}
        type="file"
        onChange={handleImage}
      />
      <Popover open={isOpen} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    aria-label={t('project.icon.choose')}
                    className="size-10"
                    disabled={disabled}
                    type="button"
                    variant="ghost"
                  />
                }
              />
            }
          >
            <ProjectIcon icon={value} size="large" />
          </TooltipTrigger>
          <TooltipContent>{t('project.icon.choose')}</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-80" glass>
          <div className="flex flex-wrap gap-2">
            {PROJECT_ICON_COLORS.map((option) => {
              const isSelected =
                value?.type === 'preset'
                  ? value.color === option.color
                  : !value && option.color === 'neutral'
              return (
                <Button
                  key={option.color}
                  aria-label={t('project.icon.color', { color: t(option.labelKey) })}
                  aria-pressed={isSelected}
                  disabled={disabled}
                  size="icon-sm"
                  type="button"
                  variant={isSelected ? 'outline' : 'ghost'}
                  onClick={() => handleColor(option.color)}
                >
                  <span
                    className={cn(
                      'size-3.5 rounded-full',
                      PROJECT_ICON_SWATCH_CLASSES[option.color],
                    )}
                  />
                </Button>
              )
            })}
          </div>
          <Separator />
          <div className="grid grid-cols-8 gap-1">
            {PROJECT_ICON_OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected =
                value?.type === 'preset'
                  ? value.name === option.name
                  : !value && option.name === 'folder'
              return (
                <Button
                  key={option.name}
                  aria-label={t('project.icon.option', { icon: t(option.labelKey) })}
                  aria-pressed={isSelected}
                  disabled={disabled}
                  size="icon-lg"
                  type="button"
                  variant={isSelected ? 'outline' : 'ghost'}
                  onClick={() => handlePreset(option.name)}
                >
                  <Icon />
                </Button>
              )
            })}
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-2">
            <Button
              disabled={disabled}
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus data-icon="inline-start" />
              {t('project.image.choose')}
            </Button>
            <Button disabled={disabled} type="button" onClick={() => setOpen(false)}>
              {t('common.done')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
