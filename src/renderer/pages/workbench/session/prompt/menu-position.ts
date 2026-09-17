export type SlashCommandMenuPlacement = 'above' | 'below'

type RectLike = {
  bottom: number
  left: number
  right: number
  top: number
}

type Size = {
  height: number
  width: number
}

export type SlashCommandMenuPositionInput = {
  anchorRect: RectLike
  gap?: number
  menuSize: Size
  placement: SlashCommandMenuPlacement
  viewportPadding?: number
  viewportSize: Size
}

export function calculateSlashCommandMenuPosition({
  anchorRect,
  gap = 8,
  menuSize,
  placement,
  viewportPadding = 12,
  viewportSize,
}: SlashCommandMenuPositionInput) {
  const wouldOverflowRight = anchorRect.left + menuSize.width + viewportPadding > viewportSize.width
  const preferredLeft = wouldOverflowRight ? anchorRect.right - menuSize.width : anchorRect.left
  const maxLeft = viewportSize.width - viewportPadding - menuSize.width
  const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft))
  const aboveTop = anchorRect.top - gap - menuSize.height
  const belowTop = anchorRect.bottom + gap
  const fitsAbove = aboveTop >= viewportPadding
  const fitsBelow = belowTop + menuSize.height + viewportPadding <= viewportSize.height
  const effectivePlacement =
    placement === 'above'
      ? fitsAbove || !fitsBelow
        ? 'above'
        : 'below'
      : fitsBelow || !fitsAbove
        ? 'below'
        : 'above'
  const preferredTop = effectivePlacement === 'above' ? aboveTop : belowTop
  const maxTop = viewportSize.height - viewportPadding - menuSize.height
  const top = Math.max(viewportPadding, Math.min(preferredTop, maxTop))

  return { left, top }
}
