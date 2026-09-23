import compactData from 'emojibase-data/en/compact.json'
import shortcodesData from 'emojibase-data/en/shortcodes/emojibase.json'

export type EmojiEntry = { char: string; keywords: string }

/** Display groups in tab order; group 2 holds invisible components and is skipped. */
export const EMOJI_GROUP_IDS = [0, 1, 3, 4, 5, 6, 7, 8, 9] as const
export type EmojiGroupId = (typeof EMOJI_GROUP_IDS)[number]
export type EmojiTabId = 'suggested' | EmojiGroupId

/** Suggested tab pins these emojis, referenced by hexcode so characters match the dataset. */
const SUGGESTED_HEXCODES = [
  '1F600', // grinning face
  '1F44D', // thumbs up
  '2764', // heart
  '1F389', // party popper
  '1F680', // rocket
  '1F440', // eyes
  '1F64F', // folded hands
  '1F525', // fire
]

type CompactEmojiEntry = {
  group?: number
  hexcode: string
  label: string
  order?: number
  tags?: string[]
  unicode: string
}

function toEntry(entry: CompactEmojiEntry): EmojiEntry {
  const shortcodes = shortcodesData[entry.hexcode as keyof typeof shortcodesData]
  const words = [
    entry.label,
    ...(entry.tags ?? []),
    ...(Array.isArray(shortcodes) ? shortcodes : []),
  ]
  return { char: entry.unicode, keywords: words.join(' ').toLowerCase() }
}

const groupedEntries = new Map<EmojiGroupId, CompactEmojiEntry[]>()
const entriesByHexcode = new Map<string, CompactEmojiEntry>()
for (const entry of compactData as CompactEmojiEntry[]) {
  if (!EMOJI_GROUP_IDS.includes(entry.group as EmojiGroupId)) continue
  entriesByHexcode.set(entry.hexcode, entry)
  const group = groupedEntries.get(entry.group as EmojiGroupId)
  if (group) group.push(entry)
  else groupedEntries.set(entry.group as EmojiGroupId, [entry])
}

const byOrder = (left: CompactEmojiEntry, right: CompactEmojiEntry) =>
  (left.order ?? 0) - (right.order ?? 0)

export const EMOJI_ENTRIES: EmojiEntry[] = [...entriesByHexcode.values()].sort(byOrder).map(toEntry)

export const EMOJI_ENTRIES_BY_GROUP = Object.fromEntries(
  [...groupedEntries].map(([groupId, entries]) => [
    groupId,
    [...entries].sort(byOrder).map(toEntry),
  ]),
) as Record<EmojiGroupId, EmojiEntry[]>

/** Suggested entries come from the dataset so their characters stay consistent. */
export const EMOJI_SUGGESTED_ENTRIES: EmojiEntry[] = SUGGESTED_HEXCODES.flatMap((hexcode) => {
  const entry = entriesByHexcode.get(hexcode)
  return entry ? [toEntry(entry)] : []
})
