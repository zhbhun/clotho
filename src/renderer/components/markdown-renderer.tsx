import DOMPurify from 'dompurify'
import { marked } from 'marked'
import morphdom from 'morphdom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { bundledLanguagesInfo, codeToHtml } from 'shiki/bundle/web'

// Dual-theme output: token colors are written to --shiki-light / --shiki-dark variables and switched by CSS.
const shikiThemes = { light: 'github-light-default', dark: 'github-dark-default' } as const

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const knownLangs = new Set(bundledLanguagesInfo.map((l) => l.id))
const codeBlockStore = new Map<string, { code: string; lang: string }>()

const markedExtensions = {
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && knownLangs.has(lang) ? lang : 'text'
      const id = `cb-${Math.random().toString(36).slice(2, 10)}`
      codeBlockStore.set(id, { code: text, lang: language })
      return `<pre><code class="shiki-pending" data-code-id="${id}">${escapeHtml(text)}</code></pre>`
    },
  },
}

marked.use(markedExtensions)

let highlighterReady = false
let readyPromise: Promise<void> | null = null

function ensureHighlighter(): Promise<void> {
  if (highlighterReady) return Promise.resolve()
  if (readyPromise) return readyPromise
  readyPromise = codeToHtml('', { lang: 'text', themes: shikiThemes, defaultColor: false })
    .then(() => {
      highlighterReady = true
      readyPromise = null
    })
    .catch(() => {
      readyPromise = null
    })
  return readyPromise
}

async function highlightBlock(el: HTMLElement, code: string, lang: string) {
  try {
    const highlighted = await codeToHtml(code, { lang, themes: shikiThemes, defaultColor: false })
    const temp = document.createElement('div')
    temp.innerHTML = DOMPurify.sanitize(highlighted)
    const newPre = temp.querySelector('pre')
    if (newPre) {
      // Shiki themes inject inline surface colors; keep token colors on spans only.
      newPre.removeAttribute('style')
      const target = el.closest('pre') ?? el
      target.replaceWith(newPre)
      newPre.classList.add('mb-2')
    }
  } catch {
    el.classList.remove('shiki-pending')
  }
}

function patchDom(container: HTMLElement, sanitized: string) {
  const temp = document.createElement('div')
  temp.className = container.className
  temp.innerHTML = sanitized
  morphdom(container, temp)
}

function renderMarkdown(content: string, isStreaming?: boolean) {
  let raw = content || ''
  // During streaming, drop the last incomplete paragraph to avoid flickering partial Markdown.
  if (isStreaming) {
    const parts = raw.split(/\n\n+/)
    if (parts.length > 1) parts.pop()
    raw = parts.join('\n\n')
  }
  const rawHtml = marked.parse(raw, { async: false }) as string
  return DOMPurify.sanitize(rawHtml)
}

// Streamed text arrives in paragraph-sized bursts. Revealing the growth at a
// pace proportional to the backlog turns each burst into visible progress
// instead of a multi-line flash; text present at mount renders immediately.
const REVEAL_CATCH_UP_MS = 400
const REVEAL_MIN_STEP_CHARS = 2

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function MarkdownRenderer({
  content,
  isStreaming,
}: {
  content: string
  isStreaming?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [initialHtml] = useState(() => renderMarkdown(content, isStreaming))
  const [ready, setReady] = useState(false)
  const [revealedLength, setRevealedLength] = useState(content.length)
  const revealedRef = useRef(content.length)
  const contentRef = useRef(content)
  const frameRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)

  const stopReveal = useCallback(() => {
    if (frameRef.current === null) return
    cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  useEffect(() => {
    if (!isStreaming || prefersReducedMotion() || content.length <= revealedRef.current) {
      // Stream ended, motion is reduced, or the tail was replaced (block
      // split): show everything immediately instead of animating stale text.
      stopReveal()
      if (revealedRef.current !== content.length) {
        revealedRef.current = content.length
        setRevealedLength(content.length)
      }
      return
    }
    contentRef.current = content
    if (frameRef.current !== null) return
    lastTickRef.current = performance.now()
    // Advance the revealed frontier toward the backlog, stepping proportional
    // to how much is pending so any burst size catches up in ~REVEAL_CATCH_UP_MS.
    const tick = (now: number) => {
      frameRef.current = null
      const target = contentRef.current
      const elapsed = Math.max(0, now - lastTickRef.current)
      lastTickRef.current = now
      const backlog = target.length - revealedRef.current
      if (backlog <= 0) return
      const step = Math.min(
        backlog,
        Math.max(REVEAL_MIN_STEP_CHARS, Math.ceil((backlog * elapsed) / REVEAL_CATCH_UP_MS)),
      )
      revealedRef.current += step
      setRevealedLength(revealedRef.current)
      if (revealedRef.current < target.length) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [content, isStreaming, stopReveal])

  useEffect(() => stopReveal, [stopReveal])

  useEffect(() => {
    let isCancelled = false
    ensureHighlighter().then(() => {
      if (!isCancelled) setReady(true)
    })
    return () => {
      isCancelled = true
    }
  }, [])

  const highlightPending = useCallback(() => {
    if (!containerRef.current || !ready) return
    const pending = containerRef.current.querySelectorAll<HTMLElement>('.shiki-pending')
    pending.forEach((el) => {
      const codeId = el.dataset.codeId
      if (!codeId) return
      const stored = codeBlockStore.get(codeId)
      if (!stored) return
      el.classList.remove('shiki-pending')
      highlightBlock(el, stored.code, stored.lang)
    })
  }, [ready])

  const displayedContent = content.slice(0, revealedLength)

  // Patch before paint: the ResizeObserver-driven scroll correction in the
  // conversation must land in the same frame as the content growth it follows.
  useLayoutEffect(() => {
    if (!containerRef.current) return
    patchDom(containerRef.current, renderMarkdown(displayedContent, isStreaming))
    highlightPending()
  }, [displayedContent, isStreaming, highlightPending])

  return (
    <div
      className="markdown-body max-w-none select-text"
      dangerouslySetInnerHTML={{ __html: initialHtml }}
      ref={containerRef}
    />
  )
}
