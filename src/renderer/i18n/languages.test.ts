import { describe, expect, it } from 'vitest'

import { resolveSystemLanguage } from './languages'

describe('language resolution', () => {
  it('maps regional system locales to supported languages and falls back to English', () => {
    expect(resolveSystemLanguage(['zh-HK'])).toBe('zh-TW')
    expect(resolveSystemLanguage(['zh-SG'])).toBe('zh-CN')
    expect(resolveSystemLanguage(['pt-PT'])).toBe('pt-BR')
    expect(resolveSystemLanguage(['ar-SA', 'he-IL'])).toBe('en')
  })
})
