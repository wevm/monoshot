import * as Links from './links.js'

describe('id', () => {
  test('is short, and drawn from an alphabet a link can carry', () => {
    const ids = Array.from({ length: 200 }, () => Links.id())
    // No `l` and no `0` or `1`, which are the characters a reader mistypes.
    expect(ids.every((value) => /^[a-km-z2-9]{10}$/.test(value))).toBe(true)
    // Two of the same in two hundred would mean the source is not random.
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('summarize', () => {
  test('takes the first line that carries anything', () => {
    expect(Links.summarize('\n\n  const a = 1\nconst b = 2\n', 'fallback')).toMatchInlineSnapshot(
      `"const a = 1"`,
    )
  })

  test('falls back when there is nothing to read', () => {
    expect(Links.summarize('\n   \n', 'A snippet')).toMatchInlineSnapshot(`"A snippet"`)
  })

  test('cuts a line longer than a card shows', () => {
    const long = `const ${'x'.repeat(200)} = 1`
    const summary = Links.summarize(long, 'fallback')
    expect(summary.length).toBe(72)
    expect(summary.endsWith('…')).toBe(true)
  })
})

describe('page', () => {
  test('carries the snippet as its own preview', () => {
    const html = Links.page({
      description: 'A typescript snippet, rendered by monoshot.',
      id: 'abc123defg',
      origin: 'https://example.com',
      state: 'N4IgZg',
      title: 'const a = 1',
    })
    expect(html).toContain(
      '<meta property="og:image" content="https://example.com/s/abc123defg/og.png">',
    )
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    // A reader is sent on to the editor, with the snippet in the fragment the
    // editor already reads every other link from.
    expect(html).toContain('content="0; url=https://example.com/#N4IgZg"')
  })

  test('escapes a snippet that would otherwise close a tag', () => {
    const html = Links.page({
      description: 'd',
      id: 'abc123defg',
      origin: 'https://example.com',
      state: 's',
      title: '</title><script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;')
  })
})
