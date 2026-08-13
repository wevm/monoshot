import { cached } from './Cdn.js'

describe('package cache', () => {
  test('deduplicates matching package versions', async () => {
    let time = 0
    const read = vi.fn((name: string, version: string) =>
      Promise.resolve({ files: {}, name, version }),
    )
    const load = cached(read, { now: () => time, ttl: 100 })
    await Promise.all([load('package', '1.0.0'), load('package', '1.0.0')])
    time = 100
    await load('package', '1.0.0')
    await load('package', '2.0.0')
    expect(read).toHaveBeenCalledTimes(2)
  })

  test('evicts old entries at its bound', async () => {
    const read = vi.fn((name: string, version: string) =>
      Promise.resolve({ files: {}, name, version }),
    )
    const load = cached(read, { limit: 1 })
    await load('one', '1.0.0')
    await load('two', '1.0.0')
    await load('one', '1.0.0')
    expect(read).toHaveBeenCalledTimes(3)
  })

  test.each(['latest', '^1.0.0'])(
    'revalidates mutable specification %s after its TTL',
    async (version) => {
      let time = 0
      const read = vi.fn((name: string, requested: string) =>
        Promise.resolve({ files: {}, name, version: requested }),
      )
      const load = cached(read, { now: () => time, ttl: 100 })
      await load('package', version)
      await load('package', version)
      time = 100
      await load('package', version)
      expect(read).toHaveBeenCalledTimes(2)
    },
  )

  test('revalidates an exact-version miss after its TTL', async () => {
    let time = 0
    const read = vi.fn(() => Promise.resolve(undefined))
    const load = cached(read, { now: () => time, ttl: 100 })
    await load('package', '1.0.0')
    await load('package', '1.0.0')
    time = 100
    await load('package', '1.0.0')
    expect(read).toHaveBeenCalledTimes(2)
  })
})
