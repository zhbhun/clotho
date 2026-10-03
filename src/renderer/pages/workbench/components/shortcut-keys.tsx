import { Kbd, KbdGroup } from '@/shadcn/kbd'
import type { ShortcutBinding, ShortcutPlatform } from '@/shared/shortcuts'

import { shortcutBindingKeyLabels } from '../../../services/shortcuts/bindings'

/** A binding rendered as one boxed keycap per key, the way editor command
    palettes hint shortcuts. */
export function ShortcutKeys({
  binding,
  platform,
}: {
  binding: ShortcutBinding
  platform: ShortcutPlatform
}) {
  return (
    <KbdGroup className="gap-0.5">
      {shortcutBindingKeyLabels(binding, platform).map((label, index) => (
        <Kbd key={`${label}-${index}`} className="rounded-sm border border-border">
          {label}
        </Kbd>
      ))}
    </KbdGroup>
  )
}
