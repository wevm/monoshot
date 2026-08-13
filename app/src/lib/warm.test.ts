import * as Warm from './warm.js'

describe('theme warming', () => {
  test('loads no more than the requested limit', async () => {
    const loaded: string[] = []
    await Warm.themes({
      from: 'c',
      limit: 3,
      list: ['a', 'b', 'c', 'd', 'e'],
      load: (theme) => {
        loaded.push(theme)
        return Promise.resolve()
      },
      signal: new AbortController().signal,
    })
    expect(loaded).toEqual(['c', 'd', 'b'])
  })
})
