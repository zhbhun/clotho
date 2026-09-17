import { render, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { MarkdownRenderer } from './markdown-renderer'

const shikiMocks = vi.hoisted(() => ({
  codeToHtml: vi.fn(async (code: string) => {
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre class="shiki github-light-default" style="background-color:#ffffff; color: #1f2328;"><code>${escaped}</code></pre>`
  }),
}))

vi.mock('shiki/bundle/web', () => ({
  bundledLanguagesInfo: [{ id: 'bash' }, { id: 'text' }],
  codeToHtml: shikiMocks.codeToHtml,
}))

describe('MarkdownRenderer', () => {
  it('includes markdown content in the initial markup', () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer content={'Rendered **before paint**<script>alert(1)</script>'} />,
    )

    expect(markup).toContain('Rendered <strong>before paint</strong>')
    expect(markup).not.toContain('<script>')
  })

  it('renders fenced code blocks without nesting pre elements', async () => {
    const { container } = render(
      <MarkdownRenderer content={'```bash\necho "# test" >> README.md\n```'} />,
    )

    await waitFor(() => {
      expect(shikiMocks.codeToHtml).toHaveBeenCalled()
    })

    expect(container.querySelector('pre pre')).toBeNull()
    expect(container.querySelector('pre')?.textContent).toBe('echo "# test" >> README.md')
  })
})
