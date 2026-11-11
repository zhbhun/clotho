import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PluginAvatar, pluginNameHue } from './plugin-avatar'

describe('pluginNameHue', () => {
  it('is deterministic for the same name', () => {
    expect(pluginNameHue('frontend-design')).toBe(pluginNameHue('frontend-design'))
  })

  it('returns an integer hue within 0–359 for boundary hashes', () => {
    // '$h' hashes to 610, which rounded to exactly 360 before the final % 360.
    for (const name of [
      '$h',
      'a',
      'superpowers',
      'claude-md-management',
      '上传中文',
      'x'.repeat(200),
    ]) {
      const hue = pluginNameHue(name)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThanOrEqual(359)
      expect(Number.isInteger(hue)).toBe(true)
    }
    expect(pluginNameHue('a')).toBeLessThan(360)
  })
})

describe('PluginAvatar', () => {
  it('renders the uppercase first character', () => {
    const { container } = render(<PluginAvatar name="frontend-design" />)
    expect(container.textContent).toBe('F')
  })

  it('falls back to a placeholder for an empty name', () => {
    const { container } = render(<PluginAvatar name="" />)
    expect(container.textContent).toBe('?')
  })
})
