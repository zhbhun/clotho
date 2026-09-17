import { type ComponentProps } from 'react'

import { cn } from '@/shadcn/utils'

export function SidebarToggleIcon({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-[14px]', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      {...props}
    >
      <rect x="1" y="3" width="22" height="18" rx="3" />
      <path d="M8 3v18" />
    </svg>
  )
}
