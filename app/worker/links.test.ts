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

describe('card', () => {
  test('renders the readable canvas at social-card dimensions', () => {
    expect(Links.card).toMatchInlineSnapshot(`
      {
        "height": 420,
        "padding": 80,
        "scale": 1.5,
        "version": 3,
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

describe('withoutTypes', () => {
  test('removes query rows without changing surrounding source', () => {
    expect(Links.withoutTypes('const value = run()\n//    ^?\nvalue\n // ^?  ')).toBe(
      'const value = run()\nvalue',
    )
  })

  test('preserves comments that are not type queries', () => {
    expect(Links.withoutTypes('// explain ^? here\nconst value = 1')).toBe(
      '// explain ^? here\nconst value = 1',
    )
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

describe('describe', () => {
  /** Creates a deterministic implementation of the model interface. */
  function answering(answer: unknown): Links.describe.Model {
    return { run: () => Promise.resolve(answer) }
  }

  /** Wraps model output in the OpenAI-compatible response format. */
  function chat(content: string) {
    return { choices: [{ message: { content } }] }
  }

  test('names a snippet from the two lines a model answers with', async () => {
    const said = await Links.describe(
      answering(chat('Summarize Order Totals\ncalculating a total cost')),
      'const total = items.reduce((sum, item) => sum + item.price, 0)',
    )
    expect(said).toMatchInlineSnapshot(`
      {
        "description": "A code snippet of calculating a total cost",
        "title": "Summarize Order Totals",
      }
    `)
  })

  test('reads the bare envelope the same binding has also returned', async () => {
    const said = await Links.describe(
      answering({ response: 'Debounce Timer\ndelaying a call until typing stops' }),
      'const debounce = 1',
    )
    expect(said?.title).toMatchInlineSnapshot(`"Debounce Timer"`)
  })

  test('strips the labels and the opening a model repeats back', async () => {
    const said = await Links.describe(
      answering(chat('Title: "Fetch User"\nSubject: A code snippet of loading a user by id.')),
      'const user = 1',
    )
    expect(said).toMatchInlineSnapshot(`
      {
        "description": "A code snippet of loading a user by id",
        "title": "Fetch User",
      }
    `)
  })

  test('cuts an answer longer than a preview shows', async () => {
    const said = await Links.describe(
      answering(chat(`${'name '.repeat(40)}\n${'word '.repeat(100)}`)),
      'const a = 1',
    )
    expect(said?.title.length).toBe(60)
    // Apply the description limit before adding the fixed sentence prefix.
    expect(said?.description.length).toBe('A code snippet of '.length + 180)
    expect(said?.title.endsWith('…')).toBe(true)
  })

  test('answers nothing when a model gives one line', async () => {
    expect(await Links.describe(answering(chat('Just a title')), 'const a = 1')).toBeUndefined()
  })

  test('answers nothing when a model answers in a shape this cannot read', async () => {
    expect(await Links.describe(answering({ unexpected: true }), 'const a = 1')).toBeUndefined()
  })

  test('answers nothing when inference fails', async () => {
    const failing: Links.describe.Model = { run: () => Promise.reject(new Error('capacity')) }
    expect(await Links.describe(failing, 'const a = 1')).toBeUndefined()
  })

  test('gives up on a reading that never answers', async () => {
    vi.useFakeTimers()
    try {
      // Simulate a binding that never resolves or rejects.
      const pending: Links.describe.Model = { run: () => new Promise(() => {}) }
      const said = Links.describe(pending, 'const a = 1')
      await vi.advanceTimersByTimeAsync(30_000)
      expect(await said).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
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
