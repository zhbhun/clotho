// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'

import { wrapRequestHandlers } from './rpc'

describe('RPC error logging', () => {
  test('reports failed handlers without changing their result or rejection', async () => {
    const caught = new Error('request failed')
    const onError = vi.fn()
    const handlers = wrapRequestHandlers(
      {
        failing: async () => {
          throw caught
        },
        successful: async (value: number) => value * 2,
      },
      onError,
    )

    await expect(handlers.successful(3)).resolves.toBe(6)
    await expect(handlers.failing()).rejects.toBe(caught)
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith('failing', caught)
  })
})
