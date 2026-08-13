import { Codec } from 'monoshot'

import * as Shared from './shared.server.js'

const get = vi.hoisted(() => vi.fn())

vi.mock('cloudflare:workers', () => ({ env: { LINKS: { get } } }))

describe('load', () => {
  test('derives metadata for a legacy shared record', async () => {
    const state = Codec.serialize({ code: 'const answer = 42', lang: 'typescript' })
    get.mockResolvedValueOnce(state)

    await expect(Shared.load('abc123')).resolves.toEqual({
      description: 'A typescript snippet, rendered by monoshot.',
      state,
      title: 'const answer = 42',
    })
  })

  test('returns nothing when the shared record has expired', async () => {
    get.mockResolvedValueOnce(null)
    await expect(Shared.load('expired')).resolves.toBeUndefined()
  })
})
