import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConversationView } from '.'
import { ThemeProvider } from '../../../../components/theme-provider'
import { DEFAULT_APP_PREFERENCES, initializeAppSettings } from '../../../../services/app-settings'
import type { ClaudeMessage } from '../services/message'
import {
  ConversationToc,
  buildConversationTocItems,
  markerPositionPercent,
  markerWidthForDistance,
} from './conversation-toc'
import { computeTurns } from './turns'

function rect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}

function intersectionEntry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  return {
    boundingClientRect: rect(0, 10),
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: isIntersecting ? rect(0, 10) : rect(0, 0),
    isIntersecting,
    rootBounds: rect(0, 500),
    target,
    time: 0,
  }
}

function TocHarness({ messages }: { messages: ClaudeMessage[] }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const userIds = messages.filter((message) => message.role === 'user').map(({ id }) => id)

  return (
    <>
      <div data-testid="viewport" ref={setViewport}>
        {userIds.map((id) => (
          <div data-conversation-turn-id={id} key={id} />
        ))}
      </div>
      <ConversationToc turns={computeTurns(messages)} viewport={viewport} />
    </>
  )
}

const TOC_MESSAGES: ClaudeMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    content: 'First prompt',
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: 'First reply',
    blocks: [{ type: 'text', text: 'First reply' }],
  },
  {
    id: 'user-2',
    role: 'user',
    content: 'Second prompt',
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    content: 'Second reply',
    blocks: [{ type: 'text', text: 'Second reply' }],
  },
  {
    id: 'user-3',
    role: 'user',
    content: 'Third prompt',
  },
]

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('markerWidthForDistance', () => {
  it('keeps the nearest marker longest and smoothly returns distant markers to rest', () => {
    expect(markerWidthForDistance(0)).toBe(30)
    expect(markerWidthForDistance(24)).toBe(19)
    expect(markerWidthForDistance(48)).toBe(8)
    expect(markerWidthForDistance(80)).toBe(8)
  })
})

describe('markerPositionPercent', () => {
  it('keeps the first and last markers inside the track regardless of turn count', () => {
    expect(markerPositionPercent(0, 1)).toBe(50)
    expect(markerPositionPercent(0, 100)).toBe(0)
    expect(markerPositionPercent(49, 100)).toBeCloseTo(49.49, 2)
    expect(markerPositionPercent(99, 100)).toBe(100)
  })
})

describe('buildConversationTocItems', () => {
  it('pairs cleaned user content with the final Agent reply in each turn', () => {
    const messages: ClaudeMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '<ide_opened_file>/workspace/app.tsx</ide_opened_file>\nPlease fix\nthis',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Checking',
        blocks: [{ type: 'text', text: 'Checking' }],
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: 'Done with the fix',
        blocks: [{ type: 'text', text: 'Done\n\nwith the fix' }],
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'One more thing',
      },
    ]

    expect(buildConversationTocItems(computeTurns(messages))).toEqual([
      {
        id: 'user-1',
        userPreview: 'Please fix this',
        assistantPreview: 'Done with the fix',
      },
      {
        id: 'user-2',
        userPreview: 'One more thing',
        assistantPreview: undefined,
      },
    ])
  })
})

describe('ConversationToc', () => {
  it('uses virtual visibility and indexed navigation when a virtual controller is provided', () => {
    const onSelectTurn = vi.fn()
    const { container } = render(
      <ConversationToc
        turns={computeTurns(TOC_MESSAGES)}
        viewport={null}
        visibleTurnIds={new Set(['user-2'])}
        onSelectTurn={onSelectTurn}
      />,
    )
    const markers = Array.from(
      container.querySelectorAll<HTMLElement>('[data-conversation-toc-id]'),
    )

    expect(markers.map((marker) => marker.dataset.active)).toEqual(['false', 'true', 'false'])
    fireEvent.click(markers[1]!)
    expect(onSelectTurn).toHaveBeenCalledWith('user-2', 'smooth')
  })

  it('marks every conversation turn intersecting the viewport as active', () => {
    let notifyIntersections: IntersectionObserverCallback | undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notifyIntersections = callback
        }
        disconnect() {}
        observe() {}
      },
    )
    const { container } = render(<TocHarness messages={TOC_MESSAGES} />)
    const viewport = screen.getByTestId('viewport')
    const turns = Array.from(viewport.querySelectorAll<HTMLElement>('[data-conversation-turn-id]'))

    act(() => {
      notifyIntersections?.(
        [
          intersectionEntry(turns[0]!, true),
          intersectionEntry(turns[1]!, true),
          intersectionEntry(turns[2]!, false),
        ],
        {} as IntersectionObserver,
      )
    })

    const markers = Array.from(
      container.querySelectorAll<HTMLElement>('[data-conversation-toc-id]'),
    )
    expect(markers.map((marker) => marker.dataset.active)).toEqual(['true', 'true', 'false'])
  })

  it('only marks the nearest turn active while hovering and restores visible turns on leave', async () => {
    let notifyIntersections: IntersectionObserverCallback | undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notifyIntersections = callback
        }
        disconnect() {}
        observe() {}
      },
    )
    const { container } = render(<TocHarness messages={TOC_MESSAGES} />)
    const viewport = screen.getByTestId('viewport')
    const turns = Array.from(viewport.querySelectorAll<HTMLElement>('[data-conversation-turn-id]'))
    const track = container.querySelector<HTMLElement>('[data-slot="conversation-toc-track"]')!
    const markers = Array.from(
      container.querySelectorAll<HTMLElement>('[data-conversation-toc-id]'),
    )

    act(() => {
      notifyIntersections?.(
        [
          intersectionEntry(turns[0]!, true),
          intersectionEntry(turns[1]!, true),
          intersectionEntry(turns[2]!, false),
        ],
        {} as IntersectionObserver,
      )
    })
    vi.spyOn(markers[0]!, 'getBoundingClientRect').mockReturnValue(rect(100, 102))
    vi.spyOn(markers[1]!, 'getBoundingClientRect').mockReturnValue(rect(116, 118))
    vi.spyOn(markers[2]!, 'getBoundingClientRect').mockReturnValue(rect(132, 134))

    fireEvent.pointerMove(track, { clientY: 101 })
    await screen.findByText('First prompt')
    expect(markers.map((marker) => marker.dataset.active)).toEqual(['true', 'false', 'false'])

    fireEvent.pointerLeave(track)
    expect(markers.map((marker) => marker.dataset.active)).toEqual(['true', 'true', 'false'])
  })

  it('previews the nearest turn and scrolls to a selected turn', async () => {
    const { container } = render(<TocHarness messages={TOC_MESSAGES} />)
    const track = container.querySelector<HTMLElement>('[data-slot="conversation-toc-track"]')!
    const markers = Array.from(
      container.querySelectorAll<HTMLElement>('[data-conversation-toc-id]'),
    )
    const targetTurn = screen
      .getByTestId('viewport')
      .querySelector<HTMLElement>('[data-conversation-turn-id="user-2"]')!
    const scrollIntoView = vi.fn()
    targetTurn.scrollIntoView = scrollIntoView

    vi.spyOn(markers[0]!, 'getBoundingClientRect').mockReturnValue(rect(100, 102))
    vi.spyOn(markers[1]!, 'getBoundingClientRect').mockReturnValue(rect(116, 118))
    vi.spyOn(markers[2]!, 'getBoundingClientRect').mockReturnValue(rect(132, 134))

    fireEvent.pointerMove(track, { clientY: 101 })
    expect(await screen.findByText('First prompt')).toBeInTheDocument()
    expect(screen.getByText('First reply')).toBeInTheDocument()
    expect(
      screen.getByText('First prompt').closest('[data-slot="hover-card-content"]'),
    ).toHaveAttribute('data-glass', 'true')

    fireEvent.click(markers[1]!)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('uses immediate scrolling when reduced motion is enabled in app preferences', async () => {
    await initializeAppSettings({
      load: async () => ({
        ...DEFAULT_APP_PREFERENCES,
        appearance: { ...DEFAULT_APP_PREFERENCES.appearance, reducedMotion: 'reduce' },
      }),
      save: async (preferences) => preferences,
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    const { container } = render(
      <ThemeProvider disableTransitionOnChange={false}>
        <TocHarness messages={TOC_MESSAGES} />
      </ThemeProvider>,
    )
    const markers = Array.from(
      container.querySelectorAll<HTMLElement>('[data-conversation-toc-id]'),
    )
    const targetTurn = screen
      .getByTestId('viewport')
      .querySelector<HTMLElement>('[data-conversation-turn-id="user-2"]')!
    const scrollIntoView = vi.fn()
    targetTurn.scrollIntoView = scrollIntoView

    fireEvent.click(markers[1]!)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('scrolls to the previewed turn when clicking empty track space', async () => {
    const { container } = render(<TocHarness messages={TOC_MESSAGES} />)
    const track = container.querySelector<HTMLElement>('[data-slot="conversation-toc-track"]')!
    const markers = Array.from(
      container.querySelectorAll<HTMLElement>('[data-conversation-toc-id]'),
    )
    const targetTurn = screen
      .getByTestId('viewport')
      .querySelector<HTMLElement>('[data-conversation-turn-id="user-1"]')!
    const scrollIntoView = vi.fn()
    targetTurn.scrollIntoView = scrollIntoView

    vi.spyOn(markers[0]!, 'getBoundingClientRect').mockReturnValue(rect(100, 102))
    vi.spyOn(markers[1]!, 'getBoundingClientRect').mockReturnValue(rect(116, 118))
    vi.spyOn(markers[2]!, 'getBoundingClientRect').mockReturnValue(rect(132, 134))

    fireEvent.pointerMove(track, { clientY: 109 })
    expect(await screen.findByText('First prompt')).toBeInTheDocument()
    fireEvent.click(track)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('finds a stable target for every turn rendered by the conversation', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect() {}
        observe() {}
      },
    )

    const { container } = render(
      <ConversationView
        expandedTurns={{}}
        isStreaming={false}
        messages={TOC_MESSAGES}
        pendingRequests={{}}
        sentTurnIds={new Set()}
        streamingElapsed={0}
        onRespond={vi.fn()}
        onToggle={vi.fn()}
      />,
    )

    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>('[data-conversation-turn-id]'),
        (element) => element.dataset.conversationTurnId,
      ),
    ).toEqual(['user-1', 'user-2', 'user-3'])
  })

  it('renders precomputed turns without recomputing them from messages', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect() {}
        observe() {}
      },
    )

    render(
      <ConversationView
        expandedTurns={{}}
        isStreaming={false}
        messages={[]}
        pendingRequests={{}}
        sentTurnIds={new Set()}
        streamingElapsed={0}
        turns={computeTurns(TOC_MESSAGES)}
        onRespond={vi.fn()}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByText('First prompt')).toBeInTheDocument()
    expect(screen.getByText('Second prompt')).toBeInTheDocument()
    expect(screen.getByText('Third prompt')).toBeInTheDocument()
  })
})
