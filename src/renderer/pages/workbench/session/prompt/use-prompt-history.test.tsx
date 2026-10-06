import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { usePromptHistory } from './use-prompt-history'

/**
 * Wires the hook to an outer prompt value the way the composer does: setPrompt
 * mutates it, the rerender feeds it back as the prop.
 */
function setup(prompts: string[], initialPrompt = '') {
  let prompt = initialPrompt
  const setPrompt = (next: string) => {
    prompt = next
  }
  const { result, rerender } = renderHook(
    (props: { prompt: string; prompts: string[] }) =>
      usePromptHistory({ prompt: props.prompt, prompts: props.prompts, setPrompt }),
    { initialProps: { prompt, prompts } },
  )
  const sync = () => rerender({ prompt, prompts })
  const navigate = (direction: 'up' | 'down') => {
    let handled = false
    act(() => {
      handled = result.current(direction)
    })
    sync()
    return handled
  }
  return {
    edit: (next: string) => {
      prompt = next
      sync()
    },
    navigate,
    prompt: () => prompt,
  }
}

describe('usePromptHistory', () => {
  test('ArrowUp from an empty composer recalls the newest sent prompt first', () => {
    const history = setup(['a', 'b', 'c'])
    expect(history.navigate('up')).toBe(true)
    expect(history.prompt()).toBe('c')
    expect(history.navigate('up')).toBe(true)
    expect(history.prompt()).toBe('b')
  })

  test('ArrowUp stops at the oldest prompt', () => {
    const history = setup(['a', 'b'])
    history.navigate('up')
    history.navigate('up')
    expect(history.navigate('up')).toBe(true)
    expect(history.prompt()).toBe('a')
  })

  test('ArrowDown walks forward and past the newest entry restores the empty draft', () => {
    const history = setup(['a', 'b', 'c'])
    history.navigate('up')
    history.navigate('up')
    expect(history.navigate('down')).toBe(true)
    expect(history.prompt()).toBe('c')
    expect(history.navigate('down')).toBe(true)
    expect(history.prompt()).toBe('')
  })

  test('navigation does not start from a non-empty composer', () => {
    const history = setup(['a', 'b'], 'draft text')
    expect(history.navigate('up')).toBe(false)
    expect(history.prompt()).toBe('draft text')
    expect(history.navigate('down')).toBe(false)
  })

  test('an edit outside the navigation ends it, so ArrowDown no longer walks', () => {
    const history = setup(['a', 'b'])
    history.navigate('up')
    history.edit('b edited')
    expect(history.navigate('down')).toBe(false)
    expect(history.prompt()).toBe('b edited')
  })

  test('sending clears the composer and history starts over from the newest', () => {
    const history = setup(['a', 'b'])
    history.navigate('up')
    history.edit('')
    expect(history.navigate('up')).toBe(true)
    expect(history.prompt()).toBe('b')
  })

  test('an empty history leaves the arrows untouched', () => {
    const history = setup([])
    expect(history.navigate('up')).toBe(false)
    expect(history.navigate('down')).toBe(false)
    expect(history.prompt()).toBe('')
  })
})
