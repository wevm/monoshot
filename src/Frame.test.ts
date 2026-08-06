import * as Frame from './Frame.js'

describe('create', () => {
  test('reuses one highlighter across renders', async () => {
    const frame = Frame.create()
    const [first, second] = await Promise.all([
      frame.load({ lang: 'ts', theme: 'vitesse-dark' }),
      frame.load({ lang: 'tsx', theme: 'nord' }),
    ])
    expect(first).toBe(second)
    expect(first.getLoadedThemes()).toEqual(expect.arrayContaining(['vitesse-dark', 'nord']))
    expect(first.getLoadedLanguages()).toEqual(expect.arrayContaining(['ts', 'tsx']))
  })

  test('keeps instances isolated from each other', async () => {
    const one = Frame.create()
    const other = Frame.create()
    const [a, b] = await Promise.all([
      one.load({ lang: 'ts', theme: 'nord' }),
      other.load({ lang: 'ts', theme: 'nord' }),
    ])
    expect(a).not.toBe(b)
  })

  test('preloads the resources it is given', async () => {
    const frame = Frame.create({ langs: ['ts'], themes: ['nord'] })
    const highlighter = await frame.load({ lang: 'ts', theme: 'nord' })
    expect(highlighter.getLoadedThemes()).toContain('nord')
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
