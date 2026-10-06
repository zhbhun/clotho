import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClaudeAttachment } from '@/shared/rpc'

import { initializeAppI18n } from '../../../../i18n/runtime'
import { AttachmentList } from './attachment-list'

const IMAGE_ATTACHMENT: ClaudeAttachment = {
  name: 'party.png',
  content: {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'aGk=' },
  },
}

beforeEach(async () => {
  await initializeAppI18n('en', ['en-US'])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AttachmentList', () => {
  it('opens the image preview when a picture thumbnail is clicked', async () => {
    render(<AttachmentList attachments={[IMAGE_ATTACHMENT]} />)

    fireEvent.click(screen.getByAltText('party.png'))

    const dialog = await screen.findByRole('dialog')
    const preview = within(dialog).getByAltText('party.png')
    expect(preview).toHaveAttribute('src', 'data:image/png;base64,aGk=')
    // The image never loads in jsdom, so the fit scale stays at 100% until its size is known.
    expect(within(dialog).getByRole('button', { name: '100%' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Download image')).toBeInTheDocument()
  })

  it('scales the fitted image down to the viewport', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(2048)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1536)
    render(<AttachmentList attachments={[IMAGE_ATTACHMENT]} />)

    fireEvent.click(screen.getByAltText('party.png'))
    const dialog = await screen.findByRole('dialog')
    // jsdom's viewport is 1024x768: fit = min(928/2048, 672/1536, 1) = 0.4375.
    fireEvent.load(within(dialog).getByAltText('party.png'))

    const preview = within(dialog).getByAltText('party.png')
    expect(preview).toHaveAttribute('width', '896')
    expect(preview).toHaveAttribute('height', '672')
    // The toolbar names the fitted percentage instead of saying "Zoom to fit".
    expect(within(dialog).getByRole('button', { name: '44%' })).toBeInTheDocument()
  })

  it('closes on blank-canvas clicks but not on the image', async () => {
    render(<AttachmentList attachments={[IMAGE_ATTACHMENT]} />)

    fireEvent.click(screen.getByAltText('party.png'))
    const dialog = await screen.findByRole('dialog')
    const preview = within(dialog).getByAltText('party.png')

    fireEvent.click(preview)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(preview.parentElement!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('switches zoom levels from the fit default', async () => {
    render(<AttachmentList attachments={[IMAGE_ATTACHMENT]} />)

    fireEvent.click(screen.getByAltText('party.png'))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: '100%' }))
    fireEvent.click(within(dialog).getByText('200%'))

    expect(await within(dialog).findByRole('button', { name: '200%' })).toBeInTheDocument()
    expect(within(dialog).queryByText('Zoom to fit')).not.toBeInTheDocument()
  })

  it('keeps file cards inert', () => {
    render(
      <AttachmentList
        attachments={[
          {
            name: 'notes.txt',
            content: {
              type: 'document',
              source: { type: 'text', media_type: 'text/plain', data: 'aGk=' },
            },
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByText('notes.txt'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('removes a composer attachment without opening the preview', () => {
    const onRemove = vi.fn()
    render(<AttachmentList attachments={[IMAGE_ATTACHMENT]} onRemove={onRemove} />)

    fireEvent.click(screen.getByLabelText('Remove file party.png'))

    expect(onRemove).toHaveBeenCalledWith(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
