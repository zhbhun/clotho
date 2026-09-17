import { cn } from '@/shadcn/utils'

export function ProjectPath({ className, path }: { className?: string; path: string }) {
  return (
    <span className={cn('block min-w-0 truncate text-left [direction:rtl]', className)}>
      {path}
    </span>
  )
}
