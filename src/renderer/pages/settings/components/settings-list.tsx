import { type VariantProps, cva } from 'class-variance-authority'
import { Children, type ComponentProps, Fragment, type ReactNode, isValidElement } from 'react'

import { Card } from '@/shadcn/card'
import { Field } from '@/shadcn/field'
import { cn } from '@/shadcn/utils'

/**
 * Shared horizontal padding for settings rows. The list divider's inset
 * mirrors it, so dividers stay aligned with row content — keep both in sync.
 */
const ROW_PADDING_X = 'px-4'
const DIVIDER_INSET_X = 'mx-4'

const settingsRowVariants = cva(cn('group/settings-row', ROW_PADDING_X), {
  variants: {
    variant: {
      preference: 'min-h-20 py-4',
      compact: 'min-h-14 gap-3 py-2',
    },
  },
  defaultVariants: {
    variant: 'preference',
  },
})

/**
 * One row inside a `SettingsList`. Renders as a horizontal field: rows that
 * use `FieldContent` get top-aligned text (preference shape), rows with plain
 * children stay center-aligned (compact shape).
 */
function SettingsRow({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof settingsRowVariants>) {
  return (
    <Field
      data-slot="settings-row"
      orientation="horizontal"
      className={cn(settingsRowVariants({ variant }), className)}
      {...props}
    />
  )
}

SettingsRow.displayName = 'SettingsRow'

/**
 * Marks a row-wrapper component (one that renders `SettingsRow` as its root,
 * e.g. a typed preference row) so `SettingsList` treats its elements as rows
 * and draws dividers between them.
 */
function markAsRow<P>(component: (props: P) => ReactNode): (props: P) => ReactNode {
  const marked = component as ((props: P) => ReactNode) & { displayName?: string }
  marked.displayName = 'SettingsRow'
  return marked
}

/**
 * Card container for settings rows. Owns row dividers: an inset hairline
 * (`DIVIDER_INSET_X`, colored `border-in-card`) between consecutive rows, so
 * pages never hand-write separators. Non-row children render untouched and
 * never gain dividers.
 */
const SETTINGS_ROW_NAME = 'SettingsRow'

type RowElementType = ((props: unknown) => ReactNode) & { displayName?: string }

function isRowElement(child: ReactNode): boolean {
  // Compare displayName, not the function identity: react-refresh keeps stale
  // closures alive across HMR edits, which breaks identity checks.
  return (
    isValidElement(child) &&
    typeof child.type === 'function' &&
    (child.type as RowElementType).displayName === SETTINGS_ROW_NAME
  )
}

function SettingsList({ className, children, ...props }: ComponentProps<typeof Card>) {
  const items = Children.toArray(children)
  const rendered: ReactNode[] = []
  let hasSeenRow = false
  items.forEach((child, index) => {
    if (isRowElement(child) && hasSeenRow) {
      rendered.push(
        <div
          aria-hidden="true"
          className={cn(DIVIDER_INSET_X, 'h-px bg-border-in-card')}
          key={`divider-${index}`}
        />,
      )
    }
    if (isRowElement(child)) hasSeenRow = true
    rendered.push(
      <Fragment key={isValidElement(child) ? (child.key ?? index) : index}>{child}</Fragment>,
    )
  })
  return (
    <Card className={cn('gap-0 py-0', className)} {...props}>
      {rendered}
    </Card>
  )
}

export { SettingsList, SettingsRow, markAsRow }
