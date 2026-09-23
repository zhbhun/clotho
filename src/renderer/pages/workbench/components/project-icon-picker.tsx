import { type ChangeEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/popover'
import { toast } from '@/shadcn/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import type { ProjectIcon as ProjectIconValue } from '@/shared/rpc'

import { ProjectIcon } from '../../../components/project-icon'
import type { MessageKey } from '../../../i18n/resources'
import {
  ProjectImageError,
  type ProjectImageErrorCode,
  projectIconDataUrlFromFile,
} from '../../../utils/project-image'
import { EmojiPicker } from './emoji-picker/emoji-picker'

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
  const suppressOutsidePressRef = useRef(false)
  const [isOpen, setOpen] = useState(false)

  function handleEmoji(char: string) {
    onChange({ type: 'emoji', char })
    setOpen(false)
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    onProcessingChange(true)
    try {
      onChange({ type: 'custom', dataUrl: await projectIconDataUrlFromFile(file) })
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
      <Popover
        open={isOpen}
        onOpenChange={(nextOpen, details) => {
          // The hidden file input lives outside the popup DOM, so its
          // programmatic click reads as an outside press; keep the panel
          // open while that synthetic click picks a file.
          if (!nextOpen && suppressOutsidePressRef.current && details.reason === 'outside-press') {
            details.cancel()
            return
          }
          setOpen(nextOpen)
        }}
      >
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
            <ProjectIcon icon={value} plain size="large" />
          </TooltipTrigger>
          <TooltipContent>{t('project.icon.choose')}</TooltipContent>
        </Tooltip>
        <PopoverContent align="center" className="w-96" glass>
          <EmojiPicker
            disabled={disabled}
            onChoose={handleEmoji}
            onChooseImage={() => {
              suppressOutsidePressRef.current = true
              inputRef.current?.click()
              suppressOutsidePressRef.current = false
            }}
          />
        </PopoverContent>
      </Popover>
    </>
  )
}
