import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shadcn/hover-card'
import { cn } from '@/shadcn/utils'

import { useAppReducedMotion } from '../../../../components/theme-provider'
import type { ConversationTurn } from './types'

const MARKER_RESTING_WIDTH = 8
const MARKER_ACTIVE_WIDTH = 30
const MARKER_INFLUENCE_RADIUS = 48
const MARKER_RESTING_STEP = 10

export function markerWidthForDistance(distance: number): number {
  const proximity =
    1 - Math.min(Math.max(distance, 0), MARKER_INFLUENCE_RADIUS) / MARKER_INFLUENCE_RADIUS
  const easedProximity = (1 - Math.cos(proximity * Math.PI)) / 2

  return Math.round(
    MARKER_RESTING_WIDTH + (MARKER_ACTIVE_WIDTH - MARKER_RESTING_WIDTH) * easedProximity,
  )
}

export function markerPositionPercent(index: number, count: number): number {
  if (count <= 1) return 50
  return (index / (count - 1)) * 100
}

export interface ConversationTocItem {
  id: string
  userPreview: string
  assistantPreview?: string
}

const IDE_CONTEXT_PATTERN =
  /<ide_(?:opened_file|selection)[^>]*>[\s\S]*?<\/ide_(?:opened_file|selection)>/g

function previewText(value: string): string {
  return value.replace(IDE_CONTEXT_PATTERN, '').replace(/\s+/g, ' ').trim()
}

export function buildConversationTocItems(turns: ConversationTurn[]): ConversationTocItem[] {
  return turns.map((turn) => {
    const finalReply = turn.timelineItems.findLast(
      (item) => item.kind === 'text' && Boolean(item.text.trim()),
    )

    return {
      id: turn.userMessage.id,
      userPreview: previewText(turn.userMessage.content),
      assistantPreview: finalReply?.kind === 'text' ? previewText(finalReply.text) : undefined,
    }
  })
}

function sameIds(current: Set<string>, next: Set<string>): boolean {
  if (current.size !== next.size) return false
  for (const id of current) {
    if (!next.has(id)) return false
  }
  return true
}

function findTurnElements(viewport: HTMLElement, itemIds: Set<string>) {
  return Array.from(viewport.querySelectorAll<HTMLElement>('[data-conversation-turn-id]')).filter(
    (element) => itemIds.has(element.dataset.conversationTurnId ?? ''),
  )
}

export function ConversationToc({
  onSelectTurn,
  turns,
  viewport,
  visibleTurnIds,
}: {
  onSelectTurn?: (turnId: string, behavior: ScrollBehavior) => void
  turns: ConversationTurn[]
  viewport: HTMLElement | null
  visibleTurnIds?: Set<string>
}) {
  const isReducedMotion = useAppReducedMotion()
  const items = useMemo(() => buildConversationTocItems(turns), [turns])
  const markerRefs = useRef(new Map<string, HTMLDivElement>())
  const pointerYRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const hoveredIdRef = useRef<string | undefined>(undefined)
  const [observedVisibleIds, setObservedVisibleIds] = useState<Set<string>>(() => new Set())
  const [hoveredId, setHoveredId] = useState<string>()
  const itemIdsKey = JSON.stringify(items.map(({ id }) => id))

  useLayoutEffect(() => {
    if (!viewport || visibleTurnIds) return

    const itemIds = new Set<string>(JSON.parse(itemIdsKey))
    const observer = new IntersectionObserver(
      (entries) => {
        setObservedVisibleIds((current) => {
          const next = new Set(current)
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.conversationTurnId
            if (!id) continue
            if (entry.isIntersecting) {
              next.add(id)
            } else {
              next.delete(id)
            }
          }
          return sameIds(current, next) ? current : next
        })
      },
      { root: viewport },
    )
    for (const element of findTurnElements(viewport, itemIds)) {
      observer.observe(element)
    }

    return () => {
      observer.disconnect()
    }
  }, [itemIdsKey, viewport, visibleTurnIds])

  useLayoutEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    },
    [],
  )

  const updateMarkerWidths = useCallback(() => {
    animationFrameRef.current = null
    const pointerY = pointerYRef.current
    if (pointerY === null) return

    const markerUpdates: Array<{ marker: HTMLDivElement; width: number }> = []
    let nearestId: string | undefined
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const item of items) {
      const marker = markerRefs.current.get(item.id)
      if (!marker) continue

      const bounds = marker.getBoundingClientRect()
      const distance = Math.abs(pointerY - (bounds.top + bounds.bottom) / 2)
      markerUpdates.push({ marker, width: markerWidthForDistance(distance) })
      if (distance < nearestDistance) {
        nearestId = item.id
        nearestDistance = distance
      }
    }
    for (const { marker, width } of markerUpdates) {
      marker.style.width = `${width}px`
    }

    hoveredIdRef.current = nearestId
    setHoveredId((current) => (current === nearestId ? current : nearestId))
  }, [items])

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    pointerYRef.current = event.clientY
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(updateMarkerWidths)
    }
  }

  function handlePointerLeave() {
    pointerYRef.current = null
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    for (const marker of markerRefs.current.values()) {
      marker.style.width = `${MARKER_RESTING_WIDTH}px`
    }
    hoveredIdRef.current = undefined
    setHoveredId(undefined)
  }

  function handleSelect(id: string) {
    const behavior = isReducedMotion ? 'auto' : 'smooth'
    if (onSelectTurn) {
      onSelectTurn(id, behavior)
      return
    }
    if (!viewport) return

    const target = findTurnElements(viewport, new Set([id])).find(
      (element) => element.dataset.conversationTurnId === id,
    )
    if (!target) return

    target.scrollIntoView({ behavior, block: 'start' })
  }

  function handleTrackClick(event: MouseEvent<HTMLDivElement>) {
    const marker = (event.target as HTMLElement).closest<HTMLElement>('[data-conversation-toc-id]')
    const id = marker?.dataset.conversationTocId ?? hoveredIdRef.current
    if (id) handleSelect(id)
  }

  if (items.length === 0) return null
  const activeVisibleIds = visibleTurnIds ?? observedVisibleIds

  return (
    <div
      className="absolute top-1/2 left-3 z-20 hidden -translate-y-1/2 min-[960px]:block"
      data-slot="conversation-toc"
    >
      <div
        className="w-12 cursor-pointer py-4"
        data-slot="conversation-toc-track"
        onClick={handleTrackClick}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
      >
        <div
          className="relative w-12"
          style={{
            height: `min(${Math.max((items.length - 1) * MARKER_RESTING_STEP, 2)}px, calc(100vh - 12rem))`,
          }}
        >
          {items.map((item, index) => {
            const isHovered = hoveredId === item.id
            const isActive = hoveredId === undefined ? activeVisibleIds.has(item.id) : isHovered

            return (
              <HoverCard key={item.id} open={isHovered}>
                <HoverCardTrigger
                  closeDelay={0}
                  delay={0}
                  render={
                    <div
                      className={cn(
                        'absolute left-0 h-0.5 -translate-y-1/2 cursor-pointer rounded-full transition-[width,background-color] duration-150',
                        isReducedMotion && 'transition-none',
                        isActive ? 'bg-foreground-subtlest' : 'bg-foreground-subtlest/30',
                      )}
                      data-active={isActive}
                      data-conversation-toc-id={item.id}
                      ref={(element) => {
                        if (element) {
                          markerRefs.current.set(item.id, element)
                        } else {
                          markerRefs.current.delete(item.id)
                        }
                      }}
                      style={{
                        top: `${markerPositionPercent(index, items.length)}%`,
                        width: MARKER_RESTING_WIDTH,
                      }}
                    />
                  }
                />
                <HoverCardContent
                  align="center"
                  className="w-80"
                  glass
                  side="right"
                  sideOffset={10}
                >
                  <div className="flex flex-col gap-1 text-xs/relaxed">
                    <p className="line-clamp-3 whitespace-pre-wrap">{item.userPreview}</p>
                    {item.assistantPreview ? (
                      <p className="line-clamp-5 whitespace-pre-wrap text-foreground-subtlest">
                        {item.assistantPreview}
                      </p>
                    ) : null}
                  </div>
                </HoverCardContent>
              </HoverCard>
            )
          })}
        </div>
      </div>
    </div>
  )
}
