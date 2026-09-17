// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ClaudeToolRequest } from '../../../../../services/claude/claude'
import { AskPanel } from './request-panel'

function askRequest(input: unknown, toolUseId = 'tu-1'): ClaudeToolRequest {
  return { kind: 'ask', toolUseId, input }
}

describe('AskPanel', () => {
  it('uses the single question header as the title without repeating the question', () => {
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [
              {
                question: 'This is a simple test question—how are you feeling today?',
                header: 'Mood',
                options: [{ label: 'Great' }],
              },
            ],
          }),
        ]}
        onRespond={vi.fn()}
      />,
    )

    expect(screen.getByText('Mood')).toBeInTheDocument()
    expect(
      screen.getAllByText('This is a simple test question—how are you feeling today?'),
    ).toHaveLength(1)
    expect(screen.queryByText('0 / 1')).not.toBeInTheDocument()
    expect(screen.queryByText(/^1\. /)).not.toBeInTheDocument()
  })

  it('falls back to Questions when a single question has no header', () => {
    render(
      <AskPanel
        requests={[
          askRequest({ questions: [{ question: 'Which one?', options: [{ label: 'A' }] }] }),
        ]}
        onRespond={vi.fn()}
      />,
    )

    expect(screen.getByText('Questions')).toBeInTheDocument()
  })

  it('numbers multiple questions and updates their completion count', () => {
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [
              {
                question: 'Which CSS approach should we use?',
                header: 'Styling',
                options: [{ label: 'Tailwind CSS 4' }],
                multiSelect: false,
              },
              {
                question: 'Which tools should be enabled?',
                header: 'Toolchain',
                options: [{ label: 'ESLint' }],
                multiSelect: true,
              },
            ],
          }),
        ]}
        onRespond={vi.fn()}
      />,
    )

    expect(screen.getByText('Questions')).toBeInTheDocument()
    expect(screen.getByText('1. Styling')).toBeInTheDocument()
    expect(screen.getByText('2. Toolchain')).toBeInTheDocument()
    expect(screen.getByText('0 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Tailwind CSS 4/ }))
    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /ESLint/ }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('uses a text cancel action instead of an icon-only close action', () => {
    render(
      <AskPanel
        requests={[askRequest({ questions: [{ question: 'q', options: [{ label: 'A' }] }] })]}
        onRespond={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '取消' })).toHaveTextContent('取消')
  })

  it('shows its fallback only while no question request is pending', () => {
    type Props = ComponentProps<typeof AskPanel> & { fallback: ReactNode }
    const AskPanelWithFallback = AskPanel as ComponentType<Props>
    const onRespond = vi.fn()
    const fallback = <div>Prompt composer</div>
    const { rerender } = render(
      <AskPanelWithFallback requests={[]} fallback={fallback} onRespond={onRespond} />,
    )

    expect(screen.getByText('Prompt composer')).toBeInTheDocument()

    rerender(
      <AskPanelWithFallback
        requests={[askRequest({ questions: [{ question: 'q', options: [{ label: 'A' }] }] })]}
        fallback={fallback}
        onRespond={onRespond}
      />,
    )

    expect(screen.queryByText('Prompt composer')).not.toBeInTheDocument()
    expect(screen.getByText('q')).toBeInTheDocument()
  })

  it('keeps submit disabled until a single-select question is answered', () => {
    const onRespond = vi.fn()
    render(
      <AskPanel
        requests={[
          askRequest({ questions: [{ question: 'Which one?', options: [{ label: 'A' }] }] }),
        ]}
        onRespond={onRespond}
      />,
    )

    const submit = screen.getByRole('button', { name: '提交' })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByText('A'))
    expect(submit).not.toBeDisabled()
  })

  it('submits the selected option label keyed by question text', () => {
    const onRespond = vi.fn()
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [
              {
                question: 'Which approach should we use?',
                header: 'Approach',
                options: [
                  { label: 'Option A', description: 'Description A' },
                  { label: 'Option B' },
                ],
              },
            ],
          }),
        ]}
        onRespond={onRespond}
      />,
    )

    fireEvent.click(screen.getByText('Option A'))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    expect(onRespond).toHaveBeenCalledWith('tu-1', {
      behavior: 'allow',
      updatedInput: {
        questions: [
          {
            question: 'Which approach should we use?',
            header: 'Approach',
            options: [{ label: 'Option A', description: 'Description A' }, { label: 'Option B' }],
          },
        ],
        answers: { 'Which approach should we use?': 'Option A' },
      },
    })
  })

  it('keeps the form available and shows a retryable error when submission fails', async () => {
    const onRespond = vi.fn(async () => {
      throw new Error('RPC unavailable')
    })
    render(
      <AskPanel
        requests={[
          askRequest({ questions: [{ question: 'Which one?', options: [{ label: 'A' }] }] }),
        ]}
        onRespond={onRespond}
      />,
    )

    fireEvent.click(screen.getByText('A'))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    expect(await screen.findByText('提交回答失败，请重试')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '提交' })).not.toBeDisabled())
  })

  it('joins multiple selections with a comma', () => {
    const onRespond = vi.fn()
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [
              {
                question: 'Which should be enabled?',
                multiSelect: true,
                options: [{ label: 'Read' }, { label: 'Write' }, { label: 'Execute' }],
              },
            ],
          }),
        ]}
        onRespond={onRespond}
      />,
    )

    fireEvent.click(screen.getByText('Write'))
    fireEvent.click(screen.getByText('Execute'))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    expect(onRespond).toHaveBeenCalledTimes(1)
    const [, result] = onRespond.mock.calls[0]
    expect(result).toMatchObject({
      behavior: 'allow',
      updatedInput: { answers: { 'Which should be enabled?': 'Write, Execute' } },
    })
    expect(result.updatedInput).not.toHaveProperty('response')
  })

  it('routes custom text through the response field', () => {
    const onRespond = vi.fn()
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [{ question: 'Language?', options: [{ label: 'TypeScript' }] }],
          }),
        ]}
        onRespond={onRespond}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/自定义/), { target: { value: 'Rust' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    expect(onRespond).toHaveBeenCalledWith('tu-1', {
      behavior: 'allow',
      updatedInput: {
        questions: [{ question: 'Language?', options: [{ label: 'TypeScript' }] }],
        answers: { 'Language?': 'Rust' },
        response: 'Rust',
      },
    })
  })

  it('selects a custom radio on focus and clears it when the value is emptied', () => {
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [{ question: 'Language?', options: [{ label: 'TypeScript' }] }],
          }),
        ]}
        onRespond={vi.fn()}
      />,
    )

    const customOption = screen.getByRole('radio', { name: '其他(自定义回答)' })
    const customInput = screen.getByRole('textbox', { name: '自定义回答' })
    const submit = screen.getByRole('button', { name: '提交' })

    fireEvent.focus(customInput)
    expect(customOption).toBeChecked()
    expect(submit).toBeDisabled()

    fireEvent.change(customInput, { target: { value: 'Rust' } })
    expect(submit).not.toBeDisabled()

    fireEvent.change(customInput, { target: { value: '' } })
    expect(customOption).not.toBeChecked()
    expect(submit).toBeDisabled()
  })

  it('selects a custom checkbox on focus without clearing multi-select options', () => {
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [
              {
                question: 'Which should be enabled?',
                multiSelect: true,
                options: [{ label: 'Read' }, { label: 'Write' }],
              },
            ],
          }),
        ]}
        onRespond={vi.fn()}
      />,
    )

    const readOption = screen.getByRole('checkbox', { name: 'Read' })
    const customOption = screen.getByRole('checkbox', { name: '其他(自定义回答)' })
    const customInput = screen.getByRole('textbox', { name: '自定义回答' })
    fireEvent.click(readOption)
    fireEvent.focus(customInput)

    expect(readOption).toBeChecked()
    expect(customOption).toBeChecked()

    fireEvent.click(customOption)
    expect(readOption).toBeChecked()
    expect(customOption).not.toBeChecked()

    fireEvent.change(customInput, { target: { value: 'Additional details' } })
    expect(customOption).toBeChecked()

    fireEvent.change(customInput, { target: { value: '' } })
    expect(readOption).toBeChecked()
    expect(customOption).not.toBeChecked()
  })

  it('submits multi-select options together with selected custom text', () => {
    const onRespond = vi.fn()
    render(
      <AskPanel
        requests={[
          askRequest({
            questions: [
              {
                question: 'Which should be enabled?',
                multiSelect: true,
                options: [{ label: 'Read' }, { label: 'Write' }],
              },
            ],
          }),
        ]}
        onRespond={onRespond}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))
    fireEvent.change(screen.getByRole('textbox', { name: '自定义回答' }), {
      target: { value: 'Additional details' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    expect(onRespond).toHaveBeenCalledWith('tu-1', {
      behavior: 'allow',
      updatedInput: {
        questions: [
          {
            question: 'Which should be enabled?',
            multiSelect: true,
            options: [{ label: 'Read' }, { label: 'Write' }],
          },
        ],
        answers: { 'Which should be enabled?': 'Read, Additional details' },
        response: 'Additional details',
      },
    })
  })

  it('denies the request when dismissed', () => {
    const onRespond = vi.fn()
    render(
      <AskPanel
        requests={[askRequest({ questions: [{ question: 'q', options: [{ label: 'A' }] }] })]}
        onRespond={onRespond}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onRespond).toHaveBeenCalledWith('tu-1', { behavior: 'deny', message: '用户取消了提问' })
  })
})
