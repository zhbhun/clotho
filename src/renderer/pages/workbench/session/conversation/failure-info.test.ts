import { describe, expect, it } from 'vitest'

import { cleanProviderErrorText, failureTitleKey, parseFailureMessage } from './failure-info'

describe('parseFailureMessage', () => {
  it('extracts the status and readable quota text from an API rejection frame', () => {
    expect(
      parseFailureMessage(
        'API Error: Request rejected (429) · [1310][您已达到每周/每月使用上限，您的限额将在 2026-09-21 11:16:58 重置。][20260920170629c02c95b100804c43]',
      ),
    ).toEqual({
      status: 429,
      kind: 'rate_limit',
      detail: '您已达到每周/每月使用上限，您的限额将在 2026-09-21 11:16:58 重置。',
    })
  })

  it('extracts the model id from an unrecognized_model process error', () => {
    expect(
      parseFailureMessage(
        'Claude Code process exited with code 1. stderr: [claude-code:unrecognized_model] {"model":"zhipu-glm/glm-5.3-flash","query_source":"sdk"}',
      ),
    ).toEqual({
      status: null,
      kind: 'unrecognized_model',
      model: 'zhipu-glm/glm-5.3-flash',
      detail: 'zhipu-glm/glm-5.3-flash',
    })
  })

  it('keeps an unrecognized raw message as-is', () => {
    expect(parseFailureMessage('  network unreachable  ')).toEqual({
      status: null,
      detail: 'network unreachable',
    })
  })
})

describe('cleanProviderErrorText', () => {
  it('strips numeric codes and hex request ids but keeps dated brackets', () => {
    expect(
      cleanProviderErrorText(
        '429 [1310][限额将在 2026-09-21 11:16:58 重置。][2026092017034786ee1474d7fa4242]',
      ),
    ).toBe('429 限额将在 2026-09-21 11:16:58 重置。')
  })
})

describe('failureTitleKey', () => {
  it('maps statuses and kinds to title keys', () => {
    expect(failureTitleKey(429)).toBe('workbench.conversation.apiFailure.title.rateLimit')
    expect(failureTitleKey(null, 'rate_limit')).toBe(
      'workbench.conversation.apiFailure.title.rateLimit',
    )
    expect(failureTitleKey(null, 'unrecognized_model')).toBe(
      'workbench.conversation.apiFailure.title.unrecognizedModel',
    )
    expect(failureTitleKey(401)).toBe('workbench.conversation.apiFailure.title.auth')
    expect(failureTitleKey(529)).toBe('workbench.conversation.apiFailure.title.overloaded')
    expect(failureTitleKey(null)).toBe('workbench.conversation.apiFailure.title.generic')
  })
})
