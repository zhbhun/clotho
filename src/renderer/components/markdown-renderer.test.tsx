import { act, render, waitFor } from '@testing-library/react'
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

function stubAnimationFrames() {
  const queue: Array<() => void> = []
  let now = performance.now()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.push(() => callback(now))
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return {
    flushFrame() {
      now += 16
      const pending = queue.splice(0)
      act(() => {
        pending.forEach((run) => run())
      })
    },
  }
}

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

  it('reveals streamed growth at a backlog-paced rate and snaps when the stream ends', () => {
    const frames = stubAnimationFrames()
    const tail = 'C'.repeat(120)
    const { container, rerender } = render(<MarkdownRenderer content="One." isStreaming />)

    // Text present at mount renders immediately.
    expect(container.textContent).toContain('One.')

    rerender(<MarkdownRenderer content={`One.\n\nTwo.\n\n${tail}`} isStreaming />)

    frames.flushFrame()
    expect(container.textContent).toContain('One.')
    expect(container.textContent).not.toContain('Two.')

    frames.flushFrame()
    expect(container.textContent).toContain('Two.')
    expect(container.textContent).not.toContain(tail)

    rerender(<MarkdownRenderer content={`One.\n\nTwo.\n\n${tail}`} isStreaming={false} />)
    expect(container.textContent).toContain(tail)
    vi.unstubAllGlobals()
  })

  it('shows replaced tail content immediately instead of animating stale text', () => {
    const frames = stubAnimationFrames()
    const { container, rerender } = render(<MarkdownRenderer content="One." isStreaming />)

    rerender(<MarkdownRenderer content="One.\n\nTwo." isStreaming />)
    rerender(<MarkdownRenderer content="One." isStreaming />)
    frames.flushFrame()
    frames.flushFrame()

    expect(container.textContent).toContain('One.')
    expect(container.textContent).not.toContain('Two.')
    vi.unstubAllGlobals()
  })
})
