import { Skeleton } from '@/shadcn/skeleton'

/**
 * Store-grid tile skeleton for the Install page, mirroring the real tile:
 * letter avatar, name/count line, description, and the trailing action.
 * `index` varies line widths so rows don't read as a uniform grid.
 */
function InstallTileSkeleton({ index }: { index: number }) {
  return (
    <div
      className="relative after:absolute after:bottom-0 after:left-14 after:right-2 after:border-border/60 lg:[&:nth-last-child(n+3)]:after:border-t max-lg:[&:not(:last-child)]:after:border-t flex min-w-0 items-center gap-3 px-2 py-2.5"
      aria-hidden="true"
    >
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Skeleton
            className={`h-4 ${index % 3 === 0 ? 'w-24' : index % 3 === 1 ? 'w-32' : 'w-28'}`}
          />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className={`h-3 ${index % 2 === 0 ? 'w-52' : 'w-44'}`} />
      </div>
      <Skeleton className="size-8 shrink-0 rounded-lg" />
    </div>
  )
}

/** Loading grid of the Install page: two columns of store tiles. */
export function InstallPageSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-lg:grid-cols-1 gap-x-6"
      data-install-skeleton
    >
      {Array.from({ length: 12 }, (_, index) => (
        <InstallTileSkeleton index={index} key={index} />
      ))}
    </div>
  )
}

/** Loading rows matching the installed plugin list. */
export function PluginRowsSkeleton() {
  return (
    <div aria-hidden="true" data-plugin-rows-skeleton>
      {Array.from({ length: 6 }, (_, index) => (
        <div className="flex min-w-0 items-center gap-3 px-2 py-2.5" key={index}>
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className={`h-4 ${index % 2 === 0 ? 'w-28' : 'w-36'}`} />
            <Skeleton className="mt-1.5 h-4 w-44" />
          </div>
          <Skeleton className="h-[18.4px] w-8 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Marketplace detail loading: title block, info card rows, plugin rows. */
export function MarketplaceDetailSkeleton() {
  return (
    <section aria-hidden="true" className="flex flex-col gap-5" data-marketplace-detail-skeleton>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-5">
          <Skeleton className="size-14 shrink-0 rounded-2xl" />
          <div>
            <Skeleton className="h-7 w-44" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <Skeleton className="size-7 shrink-0 rounded-md" />
      </div>
      <Skeleton className="h-4 w-3/4 max-w-96" />
      <div className="flex flex-col">
        <div className="border-b pb-3">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="pt-2">
          {[0, 1, 2, 3].map((index) => (
            <div className="flex items-center gap-4 py-3" key={index}>
              <Skeleton className="size-7 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1 h-3 w-52" />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="border-b pb-3">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex flex-col gap-4 pt-4">
          {[0, 1].map((index) => (
            <div className="grid grid-cols-[110px_1fr] gap-4" key={index}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className={index === 0 ? 'h-4 w-40' : 'h-4 w-56'} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Plugin detail loading (installed + install detail pages): store-style
 * identity header, description, two component sections, info rows.
 */
export function PluginDetailSkeleton() {
  return (
    <section aria-hidden="true" className="flex flex-col gap-5" data-plugin-detail-skeleton>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <Skeleton className="size-14 shrink-0 rounded-2xl" />
          <div className="min-w-0">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
      </div>
      <Skeleton className="h-4 w-3/4 max-w-96" />
      {[0, 1].map((section) => (
        <div className="flex flex-col" key={section}>
          <div className="border-b pb-3">
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="flex flex-col pt-3">
            {[0, 1].map((row) => (
              <div className="flex items-center gap-4 py-3" key={row}>
                <Skeleton className="size-7 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-1 h-3 w-52" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-4 pt-1">
        {[0, 1].map((index) => (
          <div className="grid grid-cols-[110px_1fr] gap-4" key={index}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className={index === 0 ? 'h-4 w-44' : 'h-4 w-60'} />
          </div>
        ))}
      </div>
    </section>
  )
}
