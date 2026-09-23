import {
  Car,
  Clock,
  Flag,
  Hand,
  Heart,
  ImagePlus,
  Lightbulb,
  PawPrint,
  Smile,
  UtensilsCrossed,
  Volleyball,
  X,
} from 'lucide-react'
import { type ComponentType, type Ref, type UIEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shadcn/input-group'
import { cn } from '@/shadcn/utils'

import { TransientScrollArea } from '../../../../components/transient-scroll-area'
import type { MessageKey } from '../../../../i18n/resources'
import {
  EMOJI_ENTRIES,
  EMOJI_ENTRIES_BY_GROUP,
  EMOJI_GROUP_IDS,
  EMOJI_SUGGESTED_ENTRIES,
  type EmojiEntry,
  type EmojiGroupId,
  type EmojiTabId,
} from './emoji-data'
import { searchEmojis } from './emoji-search'

const GROUP_LABEL_KEYS: Record<EmojiGroupId, MessageKey> = {
  0: 'emoji.group.smileysEmotion',
  1: 'emoji.group.peopleBody',
  3: 'emoji.group.animalsNature',
  4: 'emoji.group.foodDrink',
  5: 'emoji.group.travelPlaces',
  6: 'emoji.group.activities',
  7: 'emoji.group.objects',
  8: 'emoji.group.symbols',
  9: 'emoji.group.flags',
}

const GROUP_ICONS: Record<EmojiGroupId, ComponentType<{ strokeWidth?: number }>> = {
  0: Smile,
  1: Hand,
  3: PawPrint,
  4: UtensilsCrossed,
  5: Car,
  6: Volleyball,
  7: Lightbulb,
  8: Heart,
  9: Flag,
}

const TAB_ORDER: EmojiTabId[] = ['suggested', ...EMOJI_GROUP_IDS]
/** Pixels between a section top and the container top at which the tab activates. */
const SECTION_SPY_OFFSET = 8
/** Breathing room kept above a section after an anchor jump. */
const SECTION_ANCHOR_OFFSET = 2

export function EmojiPicker({
  disabled,
  onChoose,
  onChooseImage,
}: {
  disabled: boolean
  onChoose: (char: string) => void
  onChooseImage: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<EmojiTabId>('suggested')
  const [pendingAnchor, setPendingAnchor] = useState<EmojiTabId | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef(new Map<EmojiTabId, HTMLElement | null>())
  const isSearching = query.trim().length > 0
  const results = isSearching ? searchEmojis(EMOJI_ENTRIES, query) : []

  useEffect(() => {
    if (pendingAnchor === null) return
    const container = scrollRef.current
    const section = sectionRefs.current.get(pendingAnchor)
    if (container && section) {
      container.scrollTo({
        top: Math.max(section.offsetTop - SECTION_ANCHOR_OFFSET, 0),
        behavior: 'smooth',
      })
    }
    setPendingAnchor(null)
  }, [pendingAnchor])

  function handleTab(tab: EmojiTabId) {
    setQuery('')
    setActiveTab(tab)
    setPendingAnchor(tab)
  }

  function handleQueryChange(next: string) {
    setQuery(next)
    if (isSearching && !next.trim()) setPendingAnchor(activeTab)
  }

  function clearQuery() {
    setQuery('')
    setPendingAnchor(activeTab)
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (isSearching) return
    const container = event.currentTarget
    let current: EmojiTabId = 'suggested'
    for (const tab of TAB_ORDER) {
      const section = sectionRefs.current.get(tab)
      if (!section || section.offsetTop - SECTION_SPY_OFFSET > container.scrollTop) break
      current = tab
    }
    setActiveTab(current)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <InputGroup className="flex-1">
          <InputGroupInput
            disabled={disabled}
            placeholder={t('emoji.search.placeholder')}
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
          />
          {isSearching ? (
            <InputGroupAddon align="inline-end" className="py-0 pr-1.5">
              <Button
                aria-label={t('emoji.search.clear')}
                className="text-foreground-subtle"
                disabled={disabled}
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={clearQuery}
              >
                <X />
              </Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <Button
          aria-label={t('project.icon.custom')}
          disabled={disabled}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onChooseImage}
        >
          <ImagePlus />
        </Button>
      </div>

      <div className="flex items-center justify-between">
        {TAB_ORDER.map((tab) => {
          const isSuggested = tab === 'suggested'
          const Icon = isSuggested ? Clock : GROUP_ICONS[tab]
          return (
            <Button
              key={tab}
              aria-label={t(isSuggested ? 'emoji.group.suggested' : GROUP_LABEL_KEYS[tab])}
              aria-pressed={!isSearching && activeTab === tab}
              className={cn(
                'text-foreground-subtle hover:text-foreground',
                !isSearching && activeTab === tab && 'bg-muted text-foreground',
              )}
              disabled={disabled}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => handleTab(tab)}
            >
              <Icon strokeWidth={1.75} />
            </Button>
          )
        })}
      </div>

      {/* max-h must sit on the viewport itself: the root stays auto-height, so the
          viewport's h-full would resolve to auto and the grid would spill out. */}
      <TransientScrollArea
        className="-mr-1"
        viewportRef={scrollRef}
        viewportProps={{ className: 'max-h-69 pr-1', onScroll: handleScroll }}
      >
        {isSearching ? (
          <>
            <p className="text-xs font-medium text-foreground-subtlest">
              {t('emoji.search.results')}
            </p>
            {results.length ? (
              <EmojiGrid entries={results} disabled={disabled} onChoose={onChoose} />
            ) : (
              <p className="flex h-24 items-center justify-center text-sm text-foreground-subtle">
                {t('emoji.search.empty')}
              </p>
            )}
          </>
        ) : (
          <>
            <EmojiSection
              ref={(element) => {
                sectionRefs.current.set('suggested', element)
              }}
              disabled={disabled}
              entries={EMOJI_SUGGESTED_ENTRIES}
              title={t('emoji.group.suggested')}
              onChoose={onChoose}
            />
            {EMOJI_GROUP_IDS.map((groupId) => (
              <EmojiSection
                key={groupId}
                ref={(element) => {
                  sectionRefs.current.set(groupId, element)
                }}
                disabled={disabled}
                entries={EMOJI_ENTRIES_BY_GROUP[groupId]}
                title={t(GROUP_LABEL_KEYS[groupId])}
                onChoose={onChoose}
              />
            ))}
          </>
        )}
      </TransientScrollArea>
    </div>
  )
}

function EmojiGrid({
  entries,
  disabled,
  onChoose,
}: {
  entries: EmojiEntry[]
  disabled: boolean
  onChoose: (char: string) => void
}) {
  return (
    <div className="mt-1 grid grid-cols-8 gap-0.5">
      {entries.map((entry) => (
        <Button
          key={entry.char}
          aria-label={entry.char}
          className="w-full text-xl"
          disabled={disabled}
          size="icon-lg"
          type="button"
          variant="ghost"
          onClick={() => onChoose(entry.char)}
        >
          {entry.char}
        </Button>
      ))}
    </div>
  )
}

function EmojiSection({
  disabled,
  entries,
  title,
  onChoose,
  ref,
}: {
  disabled: boolean
  entries: EmojiEntry[]
  title: string
  onChoose: (char: string) => void
  ref?: Ref<HTMLElement>
}) {
  return (
    <section ref={ref} className="mt-3 first:mt-0">
      <p className="text-xs font-medium text-foreground-subtlest">{title}</p>
      <EmojiGrid entries={entries} disabled={disabled} onChoose={onChoose} />
    </section>
  )
}
