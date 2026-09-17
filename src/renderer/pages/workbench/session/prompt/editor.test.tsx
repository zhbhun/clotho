import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/shadcn/tooltip'

import { initializeAppI18n } from '../../../../i18n/runtime'
import type {
  ProjectFileSearchOutline,
  ProjectFileSearchResult,
} from '../../../../services/claude/claude'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../../services/shortcuts/runtime'
import { ModelConfigurationProvider } from '../../../../stores/model-configuration-context'
import { ProviderUsageProvider } from '../../../../stores/provider-usage-context'
import { promptDocToMarkdown } from './content'
import { type PromptEditorHandle, PromptMarkdownEditor } from './editor'
import { fileReferenceFromPath } from './files'
import { PromptComposer } from './index'
import type { PromptFileSearchClient } from './use-completion'

const slashCommands = [
  {
    name: 'brainstorming',
    description: 'Explore user intent before implementation.',
    aliases: ['superpowers:brainstorming', 'brainstorm'],
    argumentHint: '[topic]',
  },
  {
    name: 'review',
    description: 'Review code changes.',
    aliases: ['code-review'],
  },
]

function rectList(rect: DOMRect): DOMRectList {
  const rects = [rect]
  return {
    0: rect,
    length: 1,
    item: (index: number) => (index === 0 ? rect : null),
    [Symbol.iterator]: () => rects[Symbol.iterator](),
  }
}

beforeAll(() => {
  const rect = new DOMRect(0, 0, 120, 24)
  Element.prototype.getBoundingClientRect = () => rect
  Element.prototype.getClientRects = () => rectList(rect)
  Range.prototype.getBoundingClientRect = () => rect
  Range.prototype.getClientRects = () => rectList(rect)
  document.elementFromPoint = () => document.querySelector('[role="textbox"]')
  Element.prototype.scrollIntoView = () => undefined
  window.scrollBy = () => undefined
})

// Assertions in this suite expect the English catalog; the global setup resets to zh-CN.
beforeEach(async () => {
  await initializeAppI18n('en', ['en-US'])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('prompt editor markdown serialization', () => {
  it('serializes file mention nodes as markdown path mentions', () => {
    expect(
      promptDocToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Analyze ' },
              {
                type: 'fileMention',
                attrs: {
                  path: '/Users/test/Downloads/temp.md',
                  name: 'temp.md',
                  mimeKind: 'markdown',
                },
              },
              { type: 'text', text: ' this file' },
            ],
          },
        ],
      }),
    ).toBe('Analyze @/Users/test/Downloads/temp.md this file')
  })

  it('serializes slash command nodes as command text', () => {
    expect(
      promptDocToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'slashCommand',
                attrs: {
                  name: 'brainstorming',
                  description: 'Explore user intent before implementation.',
                },
              },
              { type: 'text', text: ' ' },
            ],
          },
        ],
      }),
    ).toBe('/brainstorming ')
  })

  it('preserves markdown source text and hard breaks', () => {
    expect(
      promptDocToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '**Do not render**' },
              { type: 'hardBreak' },
              { type: 'text', text: '# This is also just source code' },
            ],
          },
        ],
      }),
    ).toBe('**Do not render**\n# This is also just source code')
  })
})

describe('fileReferenceFromPath', () => {
  it('uses the basename for display and classifies images', () => {
    expect(fileReferenceFromPath('/Users/test/Pictures/demo.PNG')).toEqual({
      path: '/Users/test/Pictures/demo.PNG',
      name: 'demo.PNG',
      mimeKind: 'image',
    })
  })
})

describe('PromptMarkdownEditor', () => {
  it('does not echo the mounted document back as a user edit', async () => {
    const onChange = vi.fn()

    const { rerender } = render(
      <TooltipProvider>
        <PromptMarkdownEditor value="" onChange={onChange} onSubmit={() => {}} />
      </TooltipProvider>,
    )

    // setEditable on mount and on disabled transitions must not surface the
    // document as an edit: the echo would clobber the persisted draft that
    // hydration is about to restore.
    rerender(
      <TooltipProvider>
        <PromptMarkdownEditor value="" disabled onChange={onChange} onSubmit={() => {}} />
      </TooltipProvider>,
    )
    rerender(
      <TooltipProvider>
        <PromptMarkdownEditor value="" onChange={onChange} onSubmit={() => {}} />
      </TooltipProvider>,
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not submit on the Enter that confirms an IME composition', async () => {
    const onSubmit = vi.fn()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor value="你好" onChange={() => undefined} onSubmit={onSubmit} />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.focus()

    // The WebView reports the Enter that commits a composition with keyCode 229
    // (isComposing); it must confirm the candidate, never send the prompt.
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true, keyCode: 229, which: 229 })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(editor, { key: 'Enter', isComposing: false })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps the editor mounted when parent rerenders with fresh callbacks', () => {
    function EditorHost({ tick }: { tick: number }) {
      return (
        <TooltipProvider>
          <PromptMarkdownEditor
            value=""
            onChange={() => undefined}
            onSubmit={() => {
              void tick
            }}
          />
        </TooltipProvider>
      )
    }

    const { rerender } = render(<EditorHost tick={0} />)
    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    rerender(<EditorHost tick={1} />)

    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBe(editor)
    expect(editor).toHaveFocus()
  })

  it('clears the editor content when the prompt resets after sending', async () => {
    const user = userEvent.setup()
    let latestMarkdown = ''

    function EditorHost({ prompt }: { prompt: string }) {
      return (
        <TooltipProvider>
          <PromptMarkdownEditor
            value={prompt}
            onChange={(markdown) => {
              latestMarkdown = markdown
            }}
            onSubmit={() => {}}
          />
        </TooltipProvider>
      )
    }

    const { rerender } = render(<EditorHost prompt="" />)
    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.focus()
    await user.keyboard('hello world')

    // The composer store echoes the serialized prompt string back into the props.
    rerender(<EditorHost prompt={latestMarkdown} />)
    expect(editor.textContent).toContain('hello world')

    // sendPrompt() clears via restorePrompt('', []).
    rerender(<EditorHost prompt="" />)

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Prompt' }).textContent).not.toContain(
        'hello world',
      )
    })
  })

  it('inserts pending files and emits markdown path mentions', async () => {
    const changes: string[] = []

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          filesToInsert={[fileReferenceFromPath('/Users/test/project/docs/temp.md')]}
          value=""
          onChange={(value) => changes.push(value)}
          onFilesInserted={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    await waitFor(() => {
      expect(changes).toContain('@/Users/test/project/docs/temp.md ')
    })
    expect(await screen.findByText('temp.md')).toBeInTheDocument()
  })

  it('restores a persisted file mention as an atomic block', async () => {
    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          value="@/Users/test/project/docs/temp.md "
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    expect(
      await screen.findByLabelText('temp.md: /Users/test/project/docs/temp.md'),
    ).toBeInTheDocument()
  })

  it('shows a non-image file path after the tooltip delay', async () => {
    const user = userEvent.setup()
    const path = '/Users/test/project/docs/guides/reference/temp.md'

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          filesToInsert={[fileReferenceFromPath(path)]}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const mention = await screen.findByLabelText(`temp.md: ${path}`)
    await user.hover(mention)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(await screen.findByRole('tooltip')).toHaveTextContent(path)
  })

  it('shows an image preview after the popover delay', async () => {
    const user = userEvent.setup()
    const path = '/Users/test/project/images/demo.PNG'

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          filesToInsert={[fileReferenceFromPath(path)]}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const mention = await screen.findByLabelText(`demo.PNG: ${path}`)
    await user.hover(mention)

    expect(screen.queryByRole('img', { name: 'demo.PNG' })).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'demo.PNG' })).toHaveAttribute(
      'src',
      'file:///Users/test/project/images/demo.PNG',
    )
  })

  it('renders caret guards outside file mention styling', async () => {
    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          filesToInsert={[fileReferenceFromPath('/Users/test/project/docs/temp.md')]}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const fileName = await screen.findByText('temp.md')
    const block = fileName.closest<HTMLElement>('[contenteditable="false"]')
    const nodeView = fileName.closest<HTMLElement>('.node-fileMention')
    const mention = screen.getByLabelText('temp.md: /Users/test/project/docs/temp.md')

    expect(block).not.toBeNull()
    expect(nodeView).toHaveClass('inline-block')
    expect(block?.firstChild?.textContent).toBe('\u200b')
    expect(block?.childNodes[1]).toBe(mention)
    expect(block?.lastChild?.textContent).toBe('\u200b')
    expect(getComputedStyle(block as HTMLElement).userSelect).toBe('none')
    expect(getComputedStyle(fileName).userSelect).toBe('none')
  })

  it('inserts the active slash command with a trailing space', async () => {
    const user = userEvent.setup()
    const changes: string[] = []

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value=""
          onChange={(value) => changes.push(value)}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('/bra')

    const menu = await screen.findByRole('listbox', { name: 'Slash commands' })
    const option = await within(menu).findByRole('option', { name: /brainstorming/ })
    expect(option).toHaveAttribute('title', 'Explore user intent before implementation.')
    expect(within(option).queryByText('/')).not.toBeInTheDocument()
    expect(option).toHaveTextContent('brainstorming')
    expect(option).not.toHaveTextContent('/brainstorming')
    expect(option).toHaveTextContent('Explore user intent before implementation.')
    expect(option).not.toHaveTextContent('[topic]')
    expect(option).not.toHaveTextContent('Superpowers:')

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(changes.at(-1)).toBe('/brainstorming ')
    })
    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).not.toBeInTheDocument()
  })

  it('restores a persisted slash command as an atomic block', async () => {
    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value="/brainstorming "
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    expect(await screen.findByLabelText('/brainstorming')).toBeInTheDocument()
  })

  it('shows command details after the popover delay', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value="/brainstorming "
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const command = await screen.findByLabelText('/brainstorming')
    await user.hover(command)

    expect(screen.queryByText('Brainstorming')).not.toBeInTheDocument()
    expect(await screen.findByText('Brainstorming')).toBeInTheDocument()
    expect(screen.getByText('Explore user intent before implementation.')).toBeInTheDocument()
  })

  it('renders caret guards outside slash command styling', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })
    editor.focus()
    await user.keyboard('/bra{Enter}')

    const command = screen.getByLabelText('/brainstorming')
    const block = command.closest<HTMLElement>('[contenteditable="false"]')
    const nodeView = command.closest<HTMLElement>('.node-slashCommand')

    expect(block).not.toBeNull()
    expect(nodeView).toHaveClass('inline-block')
    expect(block?.firstChild?.textContent).toBe('\u200b')
    expect(block?.childNodes[1]).toBe(command)
    expect(block?.lastChild?.textContent).toBe('\u200b')
    expect(getComputedStyle(block as HTMLElement).userSelect).toBe('none')
    expect(getComputedStyle(command).userSelect).toBe('none')
  })

  it('opens a slash empty state when commands are unavailable', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor value="" onChange={() => {}} onSubmit={() => {}} />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('/')

    expect(await screen.findByText('No commands available')).toBeInTheDocument()
  })

  it('keeps keyboard navigation at the first and last slash command', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('/')
    const brainstorming = await screen.findByRole('option', { name: /brainstorming/ })
    const review = screen.getByRole('option', { name: /review/ })

    expect(brainstorming).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowUp}')
    expect(brainstorming).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(review).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(review).toHaveAttribute('aria-selected', 'true')
  })

  it('scrolls the active command into view while navigating with the keyboard', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    const commands = Array.from({ length: 12 }, (_, index) => ({
      name: `command-${index + 1}`,
      description: `Command ${index + 1} description.`,
      argumentHint: '',
    }))

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={commands}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('/')
    await screen.findByTitle('Command 1 description.')

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    })
  })

  it('closes the slash command menu when clicking outside it', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('/bra')
    expect(await screen.findByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).not.toBeInTheDocument()
  })

  it('does not open slash commands when slash follows a non-whitespace character', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('abc/re')

    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).not.toBeInTheDocument()
  })

  it('opens an empty file completion menu for a valid at trigger', async () => {
    const user = userEvent.setup()
    const fileSearchClient: PromptFileSearchClient = {
      enterWarmup: vi.fn(async () => ({ supported: true })),
      exitWarmup: vi.fn(async () => undefined),
      getOutline: vi.fn(async () => ({ nodes: [], supported: true }) as ProjectFileSearchOutline),
      listRootEntries: vi.fn(
        async () =>
          ({
            items: [],
            query: '',
            ranking: 'root',
            source: 'root',
            supported: true,
          }) as ProjectFileSearchResult,
      ),
      search: vi.fn(
        async () => ({ items: [], query: '', supported: true }) as ProjectFileSearchResult,
      ),
    }

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          fileSearchClient={fileSearchClient}
          projectPath="/Users/test/project"
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('use @')

    expect(await screen.findByRole('listbox', { name: 'File completions' })).toBeInTheDocument()
    expect(screen.getByText('No files available')).toBeInTheDocument()
  })

  it('renders project file completions and inserts the active file as a relative mention', async () => {
    const user = userEvent.setup()
    const changes: string[] = []
    const fileSearchClient: PromptFileSearchClient = {
      enterWarmup: vi.fn(async () => ({ supported: true })),
      exitWarmup: vi.fn(async () => undefined),
      getOutline: vi.fn(
        async () =>
          ({
            nodes: [
              { kind: 'directory', name: 'src', relativePath: 'src/' },
              { kind: 'directory', name: 'renderer', relativePath: 'src/renderer/' },
              { kind: 'file', name: 'app.tsx', relativePath: 'src/renderer/app.tsx' },
            ],
            supported: true,
          }) as ProjectFileSearchOutline,
      ),
      listRootEntries: vi.fn(
        async () =>
          ({
            items: [
              {
                absolutePath: '/Users/test/project/src',
                displayPath: 'src/',
                kind: 'directory',
                name: 'src',
                ranking: 'root',
                relativePath: 'src/',
                source: 'root',
              },
              {
                absolutePath: '/Users/test/project/README.md',
                displayPath: '',
                kind: 'file',
                name: 'README.md',
                ranking: 'root',
                relativePath: 'README.md',
                source: 'root',
              },
            ],
            query: '',
            ranking: 'root',
            source: 'root',
            supported: true,
          }) as ProjectFileSearchResult,
      ),
      search: vi.fn(
        async () =>
          ({
            items: [
              {
                absolutePath: '/Users/test/project/src/renderer/app.tsx',
                displayPath: 'src/renderer',
                kind: 'file',
                matchRanges: [{ end: 3, field: 'name', start: 0 }],
                name: 'app.tsx',
                ranking: 'fuzzy',
                relativePath: 'src/renderer/app.tsx',
                score: 88,
                source: 'fff',
              },
            ],
            query: 'app',
            ranking: 'fuzzy',
            source: 'fff',
            supported: true,
          }) as ProjectFileSearchResult,
      ),
    }

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          fileSearchClient={fileSearchClient}
          projectPath="/Users/test/project"
          value=""
          onChange={(value) => changes.push(value)}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('@app')

    const option = await screen.findByRole('option', { name: /app.tsx/ })
    expect(option).toHaveTextContent('app.tsx')
    expect(option).toHaveTextContent('src/renderer')
    expect(await screen.findByText('src')).toBeInTheDocument()
    expect(screen.getByText('renderer')).toBeInTheDocument()

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(changes.at(-1)).toBe('@src/renderer/app.tsx ')
    })
    expect(screen.getByLabelText('app.tsx: src/renderer/app.tsx')).toHaveTextContent('app.tsx')
    await waitFor(() => {
      expect(fileSearchClient.exitWarmup).toHaveBeenCalledWith({
        projectPath: '/Users/test/project',
      })
    })
  })

  it('keeps previous file results visible while the next search is pending', async () => {
    const user = userEvent.setup()
    let resolveSecondSearch: ((result: ProjectFileSearchResult) => void) | undefined
    const fileSearchClient: PromptFileSearchClient = {
      enterWarmup: vi.fn(async () => ({ supported: true })),
      exitWarmup: vi.fn(async () => undefined),
      getOutline: vi.fn(async () => ({ nodes: [], supported: true }) as ProjectFileSearchOutline),
      listRootEntries: vi.fn(
        async () =>
          ({
            items: [
              {
                absolutePath: '/Users/test/project/src',
                displayPath: 'src/',
                kind: 'directory',
                name: 'src',
                ranking: 'root',
                relativePath: 'src/',
                source: 'root',
              },
            ],
            query: '',
            ranking: 'root',
            source: 'root',
            supported: true,
          }) as ProjectFileSearchResult,
      ),
      search: vi.fn(async ({ query }) => {
        if (query === 'sr') {
          return {
            items: [
              {
                absolutePath: '/Users/test/project/src/server.ts',
                displayPath: 'src',
                kind: 'file',
                name: 'server.ts',
                ranking: 'fuzzy',
                relativePath: 'src/server.ts',
                source: 'fff',
              },
            ],
            query,
            ranking: 'fuzzy',
            source: 'fff',
            supported: true,
          } as ProjectFileSearchResult
        }

        return new Promise<ProjectFileSearchResult>((resolve) => {
          resolveSecondSearch = resolve
        })
      }),
    }

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          fileSearchClient={fileSearchClient}
          projectPath="/Users/test/project"
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    screen.getByRole('textbox', { name: 'Prompt' }).focus()
    await user.keyboard('@sr')
    expect(await screen.findByRole('option', { name: /server.ts/ })).toBeInTheDocument()

    await user.keyboard('c')

    expect(screen.getByRole('option', { name: /server.ts/ })).toBeInTheDocument()
    expect(screen.queryByText('No files available')).not.toBeInTheDocument()

    resolveSecondSearch?.({
      items: [
        {
          absolutePath: '/Users/test/project/src',
          displayPath: 'src/',
          kind: 'directory',
          name: 'src',
          ranking: 'fuzzy',
          relativePath: 'src/',
          source: 'fff',
        },
      ],
      query: 'src',
      ranking: 'fuzzy',
      source: 'fff',
      supported: true,
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /src/ })).toBeInTheDocument()
    })
  })

  it('keeps the outline visible while file results or outline refreshes are pending', async () => {
    const user = userEvent.setup()
    let resolveSecondSearch: ((result: ProjectFileSearchResult) => void) | undefined
    let resolveSecondOutline: ((result: ProjectFileSearchOutline) => void) | undefined
    const fileSearchClient: PromptFileSearchClient = {
      enterWarmup: vi.fn(async () => ({ supported: true })),
      exitWarmup: vi.fn(async () => undefined),
      getOutline: vi.fn(async ({ relativePath }) => {
        if (relativePath === 'src/server.ts') {
          return {
            nodes: [
              { kind: 'directory', name: 'src', relativePath: 'src/' },
              { kind: 'file', name: 'server.ts', relativePath: 'src/server.ts' },
            ],
            supported: true,
          } as ProjectFileSearchOutline
        }

        return new Promise<ProjectFileSearchOutline>((resolve) => {
          resolveSecondOutline = resolve
        })
      }),
      listRootEntries: vi.fn(
        async () =>
          ({
            items: [],
            query: '',
            ranking: 'root',
            source: 'root',
            supported: true,
          }) as ProjectFileSearchResult,
      ),
      search: vi.fn(async ({ query }) => {
        if (query === 'sr') {
          return {
            items: [
              {
                absolutePath: '/Users/test/project/src/server.ts',
                displayPath: 'src',
                kind: 'file',
                name: 'server.ts',
                ranking: 'fuzzy',
                relativePath: 'src/server.ts',
                source: 'fff',
              },
            ],
            query,
            ranking: 'fuzzy',
            source: 'fff',
            supported: true,
          } as ProjectFileSearchResult
        }

        return new Promise<ProjectFileSearchResult>((resolve) => {
          resolveSecondSearch = resolve
        })
      }),
    }

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          fileSearchClient={fileSearchClient}
          projectPath="/Users/test/project"
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    screen.getByRole('textbox', { name: 'Prompt' }).focus()
    await user.keyboard('@sr')

    const serverOption = await screen.findByRole('option', { name: /server.ts/ })
    await waitFor(() => {
      const outlinePanel = screen
        .getByRole('listbox', { name: 'File completions' })
        .querySelector('[data-file-completion-outline]')
      expect(outlinePanel).not.toBeNull()
      expect(within(outlinePanel as HTMLElement).getByText('server.ts')).toBeInTheDocument()
    })

    await user.keyboard('c')

    expect(serverOption).toHaveAttribute('aria-selected', 'true')
    const pendingOutlinePanel = screen
      .getByRole('listbox', { name: 'File completions' })
      .querySelector('[data-file-completion-outline]')
    expect(pendingOutlinePanel).not.toBeNull()
    expect(within(pendingOutlinePanel as HTMLElement).getByText('server.ts')).toBeInTheDocument()

    resolveSecondSearch?.({
      items: [
        {
          absolutePath: '/Users/test/project/src',
          displayPath: 'src/',
          kind: 'directory',
          name: 'src',
          ranking: 'fuzzy',
          relativePath: 'src/',
          source: 'fff',
        },
      ],
      query: 'src',
      ranking: 'fuzzy',
      source: 'fff',
      supported: true,
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /src/ })).toBeInTheDocument()
    })
    const refreshingOutlinePanel = screen
      .getByRole('listbox', { name: 'File completions' })
      .querySelector('[data-file-completion-outline]')
    expect(refreshingOutlinePanel).not.toBeNull()
    expect(within(refreshingOutlinePanel as HTMLElement).getByText('server.ts')).toBeInTheDocument()

    resolveSecondOutline?.({
      nodes: [{ kind: 'directory', name: 'src', relativePath: 'src/' }],
      supported: true,
    })
  })

  it('keeps searched file and directory results in service order', async () => {
    const user = userEvent.setup()
    const fileSearchClient: PromptFileSearchClient = {
      enterWarmup: vi.fn(async () => ({ supported: true })),
      exitWarmup: vi.fn(async () => undefined),
      getOutline: vi.fn(async () => ({ nodes: [], supported: true }) as ProjectFileSearchOutline),
      listRootEntries: vi.fn(
        async () => ({ items: [], query: '', supported: true }) as ProjectFileSearchResult,
      ),
      search: vi.fn(
        async () =>
          ({
            items: [
              {
                absolutePath: '/Users/test/project/src/main.ts',
                displayPath: 'src',
                kind: 'file',
                name: 'main.ts',
                ranking: 'fuzzy',
                relativePath: 'src/main.ts',
                source: 'fff',
              },
              {
                absolutePath: '/Users/test/project/src/renderer',
                displayPath: 'src/renderer/',
                kind: 'directory',
                name: 'renderer',
                ranking: 'fuzzy',
                relativePath: 'src/renderer/',
                source: 'fff',
              },
            ],
            query: 'main',
            ranking: 'fuzzy',
            source: 'fff',
            supported: true,
          }) as ProjectFileSearchResult,
      ),
    }

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          fileSearchClient={fileSearchClient}
          projectPath="/Users/test/project"
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    screen.getByRole('textbox', { name: 'Prompt' }).focus()
    await user.keyboard('@main')

    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('main.ts'),
      expect.stringContaining('renderer'),
    ])
  })

  it('shows a disabled @ search state when there is no safe project root', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor value="" onChange={() => {}} onSubmit={() => {}} />
      </TooltipProvider>,
    )

    screen.getByRole('textbox', { name: 'Prompt' }).focus()
    await user.keyboard('@')

    expect(
      await screen.findByText('File search is unavailable in the current folder.'),
    ).toBeInTheDocument()
  })

  it('does not open file completions when at follows a non-whitespace character', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <PromptMarkdownEditor value="" onChange={() => {}} onSubmit={() => {}} />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('abc@')

    expect(screen.queryByRole('listbox', { name: 'File completions' })).not.toBeInTheDocument()
  })

  it('opens after whitespace and selects commands with ArrowDown and Tab', async () => {
    const user = userEvent.setup()
    const changes: string[] = []

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value=""
          onChange={(value) => changes.push(value)}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('use /')
    expect(await screen.findByRole('option', { name: /brainstorming/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await user.keyboard('{ArrowDown}{Tab}')

    await waitFor(() => {
      expect(changes.at(-1)).toBe('use /review ')
    })
    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).not.toBeInTheDocument()
  })

  it('closes slash commands with Escape without replacing typed text', async () => {
    const user = userEvent.setup()
    const changes: string[] = []

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          value=""
          onChange={(value) => changes.push(value)}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    const editor = screen.getByRole('textbox', { name: 'Prompt' })

    editor.focus()
    await user.keyboard('/missing')
    expect(await screen.findByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox', { name: 'Slash commands' })).not.toBeInTheDocument()
    expect(changes.at(-1)).toBe('/missing')
  })

  it('opens the slash menu when a trigger is inserted programmatically into an empty editor', async () => {
    const handle: { current: PromptEditorHandle | null } = { current: null }

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          availableCommands={slashCommands}
          ref={(instance) => {
            handle.current = instance
          }}
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )
    await screen.findByRole('textbox', { name: 'Prompt' })

    handle.current?.insertTrigger('/')

    expect(await screen.findByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument()
  })

  it('separates a programmatic trigger from preceding text so the file menu opens', async () => {
    const handle: { current: PromptEditorHandle | null } = { current: null }
    const changes: string[] = []
    const fileSearchClient: PromptFileSearchClient = {
      enterWarmup: vi.fn(async () => ({ supported: true })),
      exitWarmup: vi.fn(async () => undefined),
      getOutline: vi.fn(async () => ({ nodes: [], supported: true }) as ProjectFileSearchOutline),
      listRootEntries: vi.fn(
        async () =>
          ({
            items: [],
            query: '',
            ranking: 'root',
            source: 'root',
            supported: true,
          }) as ProjectFileSearchResult,
      ),
      search: vi.fn(
        async () => ({ items: [], query: '', supported: true }) as ProjectFileSearchResult,
      ),
    }

    render(
      <TooltipProvider>
        <PromptMarkdownEditor
          fileSearchClient={fileSearchClient}
          projectPath="/Users/test/project"
          ref={(instance) => {
            handle.current = instance
          }}
          value="todo"
          onChange={(value) => changes.push(value)}
          onSubmit={() => {}}
        />
      </TooltipProvider>,
    )

    await screen.findByRole('textbox', { name: 'Prompt' })

    handle.current?.insertTrigger('@')

    expect(await screen.findByRole('listbox', { name: 'File completions' })).toBeInTheDocument()
    await waitFor(() => {
      expect(changes.at(-1)).toBe('todo @')
    })
  })
})

describe('PromptComposer typography', () => {
  it('uses the body text size instead of the compact Card text size', () => {
    render(
      <ShortcutRuntimeProvider runtime={shortcutRuntime}>
        <ModelConfigurationProvider>
          <ProviderUsageProvider>
            <TooltipProvider>
              <PromptComposer
                attachments={[]}
                availableCommands={[]}
                canSubmit={false}
                canUsePrompt
                contextUsage={null}
                isMockProject={false}
                isStreaming={false}
                model="claude-sonnet"
                modelOptions={[]}
                permissionMode="bypassPermissions"
                prompt=""
                selectedModelLabel="Claude Sonnet"
                selectedProviderId="anthropic"
                setPermissionMode={() => undefined}
                setPrompt={() => undefined}
                setAttachments={() => undefined}
                setSelectedProviderModel={() => undefined}
                slashMenuPlacement="below"
                onSelectFiles={async () => []}
                onStop={() => undefined}
                onSubmit={() => undefined}
              />
            </TooltipProvider>
          </ProviderUsageProvider>
        </ModelConfigurationProvider>
      </ShortcutRuntimeProvider>,
    )

    const composer = screen
      .getByRole('textbox', { name: 'Prompt' })
      .closest<HTMLElement>('[data-slot="card"]')

    expect(composer).toHaveClass('text-sm')
    expect(composer).not.toHaveClass('text-xs/relaxed')
  })
})

describe('PromptComposer context usage loading', () => {
  const baseProps = {
    attachments: [],
    availableCommands: [],
    canSubmit: false,
    canUsePrompt: true,
    contextUsage: null,
    isMockProject: false,
    isStreaming: false,
    model: 'claude-sonnet',
    modelOptions: [],
    permissionMode: 'bypassPermissions' as const,
    prompt: '',
    selectedModelLabel: 'Claude Sonnet',
    selectedProviderId: 'anthropic',
    setPermissionMode: () => undefined,
    setPrompt: () => undefined,
    setAttachments: () => undefined,
    setSelectedProviderModel: () => undefined,
    slashMenuPlacement: 'below' as const,
    onSelectFiles: async () => [],
    onStop: () => undefined,
    onSubmit: () => undefined,
  }

  function renderComposer(props: Partial<Parameters<typeof PromptComposer>[0]>) {
    return render(
      <ShortcutRuntimeProvider runtime={shortcutRuntime}>
        <ModelConfigurationProvider>
          <ProviderUsageProvider>
            <TooltipProvider>
              <PromptComposer {...baseProps} {...props} />
            </TooltipProvider>
          </ProviderUsageProvider>
        </ModelConfigurationProvider>
      </ShortcutRuntimeProvider>,
    )
  }

  it('shows the sampling spinner instead of the ring while a usage sample is in flight', () => {
    const { rerender } = renderComposer({})

    expect(screen.queryByLabelText('Checking context usage')).toBeNull()

    rerender(
      <ShortcutRuntimeProvider runtime={shortcutRuntime}>
        <ModelConfigurationProvider>
          <ProviderUsageProvider>
            <TooltipProvider>
              <PromptComposer {...baseProps} isSamplingContext />
            </TooltipProvider>
          </ProviderUsageProvider>
        </ModelConfigurationProvider>
      </ShortcutRuntimeProvider>,
    )

    expect(screen.getByLabelText('Checking context usage')).toBeInTheDocument()

    rerender(
      <ShortcutRuntimeProvider runtime={shortcutRuntime}>
        <ModelConfigurationProvider>
          <ProviderUsageProvider>
            <TooltipProvider>
              <PromptComposer
                {...baseProps}
                contextUsage={{ usedTokens: 1200, maxTokens: 200000, percent: 1 }}
                isSamplingContext
              />
            </TooltipProvider>
          </ProviderUsageProvider>
        </ModelConfigurationProvider>
      </ShortcutRuntimeProvider>,
    )

    // Once the snapshot lands the ring takes over, even mid-flight resampling.
    expect(screen.queryByLabelText('Checking context usage')).toBeNull()
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Context usage 1%')
  })
})
