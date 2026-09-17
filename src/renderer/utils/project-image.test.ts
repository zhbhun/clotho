import { afterEach, describe, expect, it, vi } from 'vitest'

import { projectIconDataUrlFromFile } from './project-image'

describe('projectIconDataUrlFromFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects unsupported and oversized source images before decoding', async () => {
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    await expect(
      projectIconDataUrlFromFile(new File(['svg'], 'project.svg', { type: 'image/svg+xml' })),
    ).rejects.toMatchObject({ code: 'unsupported-type' })
    await expect(
      projectIconDataUrlFromFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
          type: 'image/png',
        }),
      ),
    ).rejects.toMatchObject({ code: 'too-large' })
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})
