import { useCallback, useEffect, useRef } from 'react'

type PromptHistoryNavigation = {
  /** Position in the history list the composer currently shows. */
  index: number
  /** Composer content saved when navigation started, restored at the end. */
  draft: string
  /** The text navigation last put into the composer; any other edit ends it. */
  recalled: string
}

/**
 * Terminal-style recall of sent prompts: with an empty composer, ArrowUp walks
 * backwards through the history and ArrowDown forward again, stepping past the
 * newest entry restores the saved draft. Any prompt change that did not come
 * from the navigation itself ends it, so editing or sending hands the arrow
 * keys back to normal cursor movement.
 */
export function usePromptHistory(args: {
  prompt: string
  prompts: ReadonlyArray<string>
  setPrompt: (prompt: string) => void
}) {
  const { prompt, prompts, setPrompt } = args
  const navigation = useRef<PromptHistoryNavigation | null>(null)

  useEffect(() => {
    if (navigation.current && prompt !== navigation.current.recalled) navigation.current = null
  }, [prompt])

  return useCallback(
    (direction: 'up' | 'down') => {
      const current = navigation.current
      if (direction === 'down') {
        if (!current) return false
        const index = current.index + 1
        // Past the newest entry the saved draft comes back and navigation ends.
        const recalled = index < prompts.length ? prompts[index] : current.draft
        if (recalled === undefined) {
          navigation.current = null
          return false
        }
        navigation.current = index < prompts.length ? { ...current, index, recalled } : null
        setPrompt(recalled)
        return true
      }
      if (current) {
        const index = Math.max(0, current.index - 1)
        const recalled = prompts[index]
        if (recalled === undefined) {
          navigation.current = null
          return false
        }
        navigation.current = { ...current, index, recalled }
        setPrompt(recalled)
        return true
      }
      // Navigation starts only from an empty composer; the (empty) draft is
      // what ArrowDown restores once the walk passes the newest entry.
      if (prompt.trim() || !prompts.length) return false
      const index = prompts.length - 1
      const recalled = prompts[index]
      if (recalled === undefined) return false
      navigation.current = { index, draft: prompt, recalled }
      setPrompt(recalled)
      return true
    },
    [prompt, prompts, setPrompt],
  )
}
