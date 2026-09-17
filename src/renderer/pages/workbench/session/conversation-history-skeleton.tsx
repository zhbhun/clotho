import { Skeleton } from '@/shadcn/skeleton'

export function ConversationHistorySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-1 flex-col gap-9 px-3 pt-8"
      data-conversation-history-skeleton
    >
      <div className="flex justify-end">
        <div className="w-[min(42%,28rem)] min-w-40 space-y-2 rounded-2xl bg-muted/55 p-4">
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
      <div className="w-[min(76%,48rem)] space-y-2.5">
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="w-[min(70%,44rem)] space-y-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}
