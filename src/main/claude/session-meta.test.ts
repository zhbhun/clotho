// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { extractSessionMeta, fieldFirst, firstUserPrompt } from './session-meta'

function userLine(content: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content }, ...extra })
}

describe('session field scanning', () => {
  it('unescapes JSON string escapes inside the value', () => {
    expect(fieldFirst(String.raw`{"customTitle":"a\"b\\c\nd\te"}`, 'customTitle')).toBe(
      'a"b\\c\nd\te',
    )
  })
})

describe('firstUserPrompt', () => {
  it('skips tool results, meta entries, and compact summaries', () => {
    const head = [
      userLine([{ type: 'tool_result', tool_use_id: 't1', content: 'done' }]),
      userLine('meta question', { isMeta: true }),
      userLine('compacted history', { isCompactSummary: true }),
      userLine('Real question'),
    ].join('\n')

    expect(firstUserPrompt(head)).toBe('Real question')
  })
})

describe('extractSessionMeta', () => {
  it('prefers custom titles, then ai titles, then recent prompts and summaries', () => {
    const head = [userLine('First question')].join('\n')

    const custom = extractSessionMeta({
      head,
      tail: [String.raw`{"customTitle":"Mine"}`, String.raw`{"aiTitle":"Auto"}`].join('\n'),
    })
    expect(custom).toMatchObject({
      title: 'Mine',
      custom_title: 'Mine',
      first_prompt: 'First question',
    })

    const ai = extractSessionMeta({ head, tail: String.raw`{"aiTitle":"Auto"}` })
    expect(ai).toMatchObject({ title: 'Auto', ai_title: 'Auto' })

    const recent = extractSessionMeta({ head, tail: String.raw`{"lastPrompt":"Recent"}` })
    expect(recent?.title).toBe('Recent')

    const summary = extractSessionMeta({ head, tail: String.raw`{"summary":"Summary"}` })
    expect(summary?.title).toBe('Summary')

    const promptOnly = extractSessionMeta({ head, tail: '' })
    expect(promptOnly).toMatchObject({ title: 'First question', first_prompt: 'First question' })
  })

  it('reads the git branch and the newest tag from the tail', () => {
    const head = [userLine('Question'), String.raw`{"gitBranch":"head-branch"}`].join('\n')
    const tail = [
      String.raw`{"gitBranch":"tail-branch"}`,
      JSON.stringify({ type: 'tag', tag: 'first' }),
      String.raw`{"customTitle":"Named"}`,
      JSON.stringify({ type: 'tag', tag: 'second' }),
    ].join('\n')

    expect(extractSessionMeta({ head, tail })).toMatchObject({
      title: 'Named',
      git_branch: 'tail-branch',
      tag: 'second',
    })
  })
})
