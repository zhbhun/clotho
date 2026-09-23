import type { EmojiEntry } from './emoji-data'

/**
 * Every whitespace-separated term must appear in an entry's keywords
 * (label, tags and shortcodes, lowercased at build time).
 */
export function searchEmojis(entries: EmojiEntry[], query: string): EmojiEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return entries.filter((entry) => terms.every((term) => entry.keywords.includes(term)))
}
