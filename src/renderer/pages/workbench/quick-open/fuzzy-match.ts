const WORD_BOUNDARY = /[\s\-_/.,\\]/

const SCORE_EXACT = 1000
const SCORE_PREFIX = 800
const SCORE_WORD_BOUNDARY = 600
const SCORE_SUBSTRING = 400
const SCORE_SUBSEQUENCE = 100
/** Capped so a late word-boundary hit still outranks any substring hit. */
const WORD_POSITION_PENALTY_CAP = 150

/** Rank how well the query matches any target, higher being better. A blank
    query or a query no target matches returns null; callers keep their own
    base order when the query is blank and drop the row when the score is. */
export function scoreFuzzyMatch(query: string, ...targets: string[]): number | null {
  const needle = normalize(query)
  if (!needle) return null

  let best: number | null = null
  for (const target of targets) {
    const score = scoreTarget(needle, normalize(target))
    if (score !== null && (best === null || score > best)) best = score
  }
  return best
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function scoreTarget(needle: string, haystack: string): number | null {
  if (!haystack) return null
  if (needle === haystack) return SCORE_EXACT

  const index = haystack.indexOf(needle)
  if (index === 0) return SCORE_PREFIX
  if (index > 0) {
    if (WORD_BOUNDARY.test(haystack[index - 1] ?? '')) {
      return SCORE_WORD_BOUNDARY - Math.min(index, WORD_POSITION_PENALTY_CAP)
    }
    return Math.max(1, SCORE_SUBSTRING - index)
  }

  return scoreSubsequence(needle, haystack)
}

/** Greedy left-to-right subsequence with a bonus for contiguous runs. */
function scoreSubsequence(needle: string, haystack: string): number | null {
  let from = 0
  let run = 0
  let bonus = 0
  for (const char of needle) {
    const at = haystack.indexOf(char, from)
    if (at === -1) return null
    run = run > 0 && at === from ? run + 1 : 1
    if (run === 2) bonus += 2
    else if (run > 2) bonus += 1
    from = at + 1
  }
  return SCORE_SUBSEQUENCE + bonus
}
