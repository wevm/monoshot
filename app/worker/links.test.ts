import * as Links from './links.js'

describe('id', () => {
  test('is short, and drawn from an alphabet a link can carry', () => {
    const ids = Array.from({ length: 200 }, () => Links.id())
    // Exclude visually ambiguous characters from generated identifiers.
    expect(ids.every((value) => /^[a-km-z2-8]{12}$/.test(value))).toBe(true)
    // Detect an obvious failure in the random identifier source.
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
      '<meta property="og:image" content="https://example.com/s/abc123defg/og.png?v=2">',
    )
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    // Redirect to the editor with the encoded state in the URL fragment.
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
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;')
  })
})

describe('card', () => {
  test('renders the readable canvas at social-card dimensions', () => {
    expect(Links.card).toMatchInlineSnapshot(`
      {
        "height": 420,
        "padding": 80,
        "scale": 1.5,
        "version": 2,
        "width": 800,
      }
    `)
    expect(Links.card.width * Links.card.scale).toBe(1200)
    expect(Links.card.height * Links.card.scale).toBe(630)
  })
})

describe('excerpt', () => {
  test('limits long lines to 72 display columns', () => {
    const shown = Links.excerpt('x'.repeat(100))
    expect(shown.code).toHaveLength(72)
    expect(shown.overflow).toEqual({ horizontal: true, vertical: false })
  })

  test('limits tall snippets to ten lines', () => {
    const shown = Links.excerpt(Array.from({ length: 12 }, (_, at) => `line ${at}`).join('\n'))
    expect(shown.code.split('\n')).toHaveLength(10)
    expect(shown.overflow).toEqual({ horizontal: false, vertical: true })
  })

  test('preserves code that fits the viewport', () => {
    expect(Links.excerpt('const a = 1')).toEqual({
      code: 'const a = 1',
      overflow: { horizontal: false, vertical: false },
    })
  })
})

describe('fade', () => {
  const html = '<html><head></head><body><div class="body">code</div></body></html>'

  test('leaves a document unchanged when nothing was clipped', () => {
    expect(Links.fade(html, { horizontal: false, vertical: false })).toBe(html)
  })

  test('fades each clipped edge', () => {
    const faded = Links.fade(html, { horizontal: true, vertical: true })
    expect(faded).toContain('class="body preview-overflow-x preview-overflow-y"')
    expect(faded).toContain('linear-gradient(to right')
    expect(faded).toContain('linear-gradient(to bottom')
  })
})

describe('read', () => {
  test('reads a link kept with what was made of it', () => {
    const kept = JSON.stringify({
      description: 'A code snippet of x',
      state: 'N4Ig',
      title: 'Sums',
    })
    expect(Links.read(kept)).toMatchInlineSnapshot(`
      {
        "description": "A code snippet of x",
        "state": "N4Ig",
        "title": "Sums",
      }
    `)
  })

  test('reads a link kept before a snippet was ever read', () => {
    // Legacy records contain only the encoded fragment.
    expect(Links.read('N4IgRiBcICYKYDM')).toMatchInlineSnapshot(`
      {
        "state": "N4IgRiBcICYKYDM",
      }
    `)
  })

  test('keeps a fragment that merely looks like a record', () => {
    expect(Links.read('{"nope":1}')).toMatchInlineSnapshot(`
      {
        "state": "{"nope":1}",
      }
    `)
  })
})
