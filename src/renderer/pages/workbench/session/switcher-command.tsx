import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { CommandDialog } from '../../../components/command-dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shadcn/command'
import { cn } from '@/shadcn/utils'

import './switcher-command.css'

export function SwitcherCommandDialog({
  className,
  ...props
}: Omit<ComponentProps<typeof CommandDialog>, 'modal' | 'showOverlay'>) {
  return (
    <CommandDialog
      {...props}
      className={cn(
        'spotlight-command-dialog top-[16vh] translate-y-0! gap-0 rounded-[22px]! p-0 sm:max-w-[760px]',
        className,
      )}
      glass
      modal={false}
      showOverlay={false}
    />
  )
}

export function SwitcherCommand({ className, ...props }: ComponentProps<typeof Command>) {
  return <Command {...props} className={cn('spotlight-command', className)} />
}

export function SwitcherCommandInput({
  actions,
  className,
  ...props
}: ComponentProps<typeof CommandInput> & { actions?: ReactNode }) {
  return (
    <div className="spotlight-command-input" data-has-actions={actions ? 'true' : undefined}>
      <CommandInput {...props} className={className} inputGroupClassName="h-[62px]!" />
      {actions ? (
        <div
          className="spotlight-command-actions"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
          }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function SwitcherCommandList({ className, ...props }: ComponentProps<typeof CommandList>) {
  return <CommandList {...props} className={cn('spotlight-command-list', className)} />
}

export function SwitcherCommandGroup({ className, ...props }: ComponentProps<typeof CommandGroup>) {
  return <CommandGroup {...props} className={cn('spotlight-command-group', className)} />
}

export function SwitcherCommandEmpty({ className, ...props }: ComponentProps<typeof CommandEmpty>) {
  return <CommandEmpty {...props} className={cn('spotlight-command-empty', className)} />
}

export function SwitcherCommandItem({
  className,
  description,
  icon: Icon,
  iconElement,
  label,
  trailing,
  ...props
}: Omit<ComponentProps<typeof CommandItem>, 'children'> & {
  description?: string
  icon?: LucideIcon
  iconElement?: ReactNode
  label: string
  trailing?: ReactNode
}) {
  return (
    <CommandItem {...props} className={cn('spotlight-command-item', className)}>
      <span aria-hidden="true" className="spotlight-command-icon">
        {iconElement ?? (Icon ? <Icon /> : null)}
      </span>
      <span className="spotlight-command-copy">
        <span className="spotlight-command-title">{label}</span>
        {description ? (
          <span aria-hidden="true" className="spotlight-command-description">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span aria-hidden="true" className="spotlight-command-trailing">
          {trailing}
        </span>
      ) : null}
    </CommandItem>
  )
}
