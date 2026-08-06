import * as Frame from './Frame.js'

describe('create', () => {
  test('serves several themes from one instance', async () => {
    const frame = Frame.create()
    await Promise.all([
      frame.load({ lang: 'ts', theme: 'vitesse-dark' }),
      frame.load({ lang: 'tsx', theme: 'nord' }),
    ])
    const [first, second] = await Promise.all([
      frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' }),
      frame.render({ code: 'const a = 1', lang: 'tsx', theme: 'nord' }),
    ])
    expect(first.theme.name).toBe('vitesse-dark')
    expect(second.theme.name).toBe('nord')
  })

  test('preloads the resources it is given', async () => {
    const frame = Frame.create({ langs: ['ts'], themes: ['nord'] })
    const result = await frame.render({ code: 'a', lang: 'ts', theme: 'nord' })
    expect(result.theme.name).toBe('nord')
  })
})

describe('render', () => {
  test('marks every line with its number', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      code: 'const a = 1\nconst b = 2',
      lang: 'ts',
      theme: 'nord',
    })
    expect([...result.html.matchAll(/data-line="(\d+)"/g)].map(([, line]) => line))
      .toMatchInlineSnapshot(`
      [
        "1",
        "2",
      ]
    `)
  })

  test('returns the resolved theme alongside the markup', async () => {
    const frame = Frame.create()
    const result = await frame.render({ code: 'a', lang: 'ts', theme: 'nord' })
    expect(result.theme.name).toMatchInlineSnapshot(`"nord"`)
    expect(result.theme.type).toMatchInlineSnapshot(`"dark"`)
  })

  test('escapes markup in the source', async () => {
    const frame = Frame.create()
    const result = await frame.render({
      code: 'const a = "<img src=x onerror=alert(1)>"',
      lang: 'ts',
      theme: 'nord',
    })
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('&#x3C;img')
  })

  test('rejects for a theme shiki does not bundle', async () => {
    const frame = Frame.create()
    await expect(
      frame.render({ code: 'a', lang: 'ts', theme: 'not-a-theme' as never }),
    ).rejects.toThrow()
  })
})

describe('create().dispose', () => {
  test('releases the highlighter and leaves the renderer usable', async () => {
    const frame = Frame.create()
    const before = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
    await frame.dispose()
    const after = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
    expect(after.html).toBe(before.html)
  })

  test('is a no-op before the first render', async () => {
    await expect(Frame.create().dispose()).resolves.toBeUndefined()
  })
})

describe('render', () => {
  test('returns a theme detached from the highlighter cache', async () => {
    const frame = Frame.create()
    const first = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'nord' })
    first.theme.bg = '#ff0000'
    const second = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'nord' })
    expect(second.theme.bg).not.toBe('#ff0000')
  })
})
