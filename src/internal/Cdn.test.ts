import { cached } from './Cdn.js'

describe('package cache', () => {
  test('deduplicates matching package versions', async () => {
    const read = vi.fn((name: string, version: string) =>
      Promise.resolve({ files: {}, name, version }),
    )
    const load = cached(read)
    await Promise.all([load('package', '1.0.0'), load('package', '1.0.0')])
    await load('package', '2.0.0')
    expect(read).toHaveBeenCalledTimes(2)
  })

  test('evicts old entries at its bound', async () => {
    const read = vi.fn((name: string, version: string) =>
      Promise.resolve({ files: {}, name, version }),
    )
    const load = cached(read, 1)
    await load('one', '1.0.0')
    await load('two', '1.0.0')
    await load('one', '1.0.0')
    expect(read).toHaveBeenCalledTimes(3)
  })
})
