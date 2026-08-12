import * as Twoslash from './Twoslash.js'

const source = `const greeting = 'hello'
//    ^?
const count: number = greeting.length
//                    ^?
`

// One resolver for the suite: each holds a TypeScript compiler, and building
// one per test would dominate the runtime.
const twoslash = Twoslash.create()

describe('create', () => {
  test('resolves the types a snippet asks for', async () => {
    const result = await twoslash.run(source)
    expect(result.queries.map((query) => ({ name: query.name, text: query.text })))
      .toMatchInlineSnapshot(`
      [
        {
          "name": "greeting",
          "text": "const greeting: "hello"",
        },
        {
          "name": "greeting",
          "text": "const greeting: "hello"",
        },
      ]
    `)
  })

  test('points a query at the identifier in the source as written', async () => {
    // The positions are useless unless they index the text the caller holds,
    // which still has its notation lines in it.
    const result = await twoslash.run(source)
    expect(result.queries.map((query) => source.slice(query.from, query.to)))
      .toMatchInlineSnapshot(`
      [
        "greeting",
        "greeting",
      ]
    `)
  })

  test('knows types nothing asked about, which is what a hover needs', async () => {
    const result = await twoslash.run(source)
    const found = result.hovers.find((hover) => hover.name === 'length')
    expect({ name: found?.name, text: found?.text }).toMatchInlineSnapshot(`
      {
        "name": "length",
        "text": "(property) String.length: number",
      }
    `)
  })

  test('resolves a snippet carrying no notations at all', async () => {
    const result = await twoslash.run('const a = 1')
    expect({ hovers: result.hovers.length, queries: result.queries.length }).toMatchInlineSnapshot(`
      {
        "hovers": 1,
        "queries": 0,
      }
    `)
  })

  test('reports what it can for code that does not compile', async () => {
    const result = await twoslash.run("const a: number = 'x'\nconst b = a\n//        ^?")
    expect(result.queries.map((query) => query.text)).toMatchInlineSnapshot(`
      [
        "const a: number",
      ]
    `)
  })

  test('reads a snippet in the language it was asked for', async () => {
    const result = await twoslash.run('const a = 1\n//    ^?', { lang: 'js' })
    expect(result.queries.map((query) => query.text)).toMatchInlineSnapshot(`
      [
        "const a: 1",
      ]
    `)
  })
})

describe('run', () => {
  test('resolves a snippet without a resolver to hold on to', async () => {
    const result = await Twoslash.run("const a = 'x'\n//    ^?")
    expect(result.queries.map((query) => query.text)).toMatchInlineSnapshot(`
      [
        "const a: "x"",
      ]
    `)
  })
})

describe('annotate', () => {
  // Twoslash reports removals in the order it found them, and each cut shifts
  // the ones after it, so a later cut only applies once the accumulated offset
  // has reached it. Sorted, the third node lands on 28 rather than 23.
  const input: Twoslash.annotate.Input = {
    code: 'abcdefghijklmnopqrstuvwxyz',
    meta: {
      removals: [
        [20, 25],
        [5, 10],
      ],
    },
    nodes: [
      { length: 3, start: 3, text: 'const def: 1', type: 'hover' },
      { length: 3, start: 7, text: 'const hij: 2', type: 'hover' },
      { length: 3, start: 18, text: 'const stu: 3', type: 'query' },
    ],
  }

  test('shifts every offset past the notation cuts before it', async () => {
    expect(Twoslash.annotate(input)).toMatchInlineSnapshot(`
      {
        "diagnostics": [],
        "hovers": [
          {
            "from": 3,
            "name": "def",
            "text": "const def: 1",
            "to": 6,
          },
          {
            "from": 12,
            "name": "hij",
            "text": "const hij: 2",
            "to": 15,
          },
        ],
        "queries": [
          {
            "from": 28,
            "name": "stu",
            "text": "const stu: 3",
            "to": 31,
          },
        ],
      }
    `)
  })

  test('leaves offsets alone when nothing was cut', async () => {
    expect(Twoslash.annotate({ ...input, meta: { removals: [] } })).toMatchInlineSnapshot(`
      {
        "diagnostics": [],
        "hovers": [
          {
            "from": 3,
            "name": "def",
            "text": "const def: 1",
            "to": 6,
          },
          {
            "from": 7,
            "name": "hij",
            "text": "const hij: 2",
            "to": 10,
          },
        ],
        "queries": [
          {
            "from": 18,
            "name": "stu",
            "text": "const stu: 3",
            "to": 21,
          },
        ],
      }
    `)
  })

  test('skips the node kinds it has nothing to say about', async () => {
    const nodes = [
      { length: 1, start: 1, type: 'completion' },
      { length: 1, start: 2, text: 'a note', type: 'highlight' },
      // A hover the language service resolved no type for.
      { length: 1, start: 3, type: 'hover' },
    ]
    expect(Twoslash.annotate({ ...input, nodes })).toMatchInlineSnapshot(`
      {
        "diagnostics": [],
        "hovers": [],
        "queries": [],
      }
    `)
  })

  test('leaves an endpoint before a cut that begins where it ends', async () => {
    // Compiled span [3, 5) against a cut at [5, 10): the message stops where
    // the notation starts, so it must not be stretched over it.
    const nodes = [{ code: 2322, length: 2, start: 3, text: 'Not assignable.', type: 'error' }]
    expect(Twoslash.annotate({ ...input, meta: { removals: [[5, 10]] }, nodes }).diagnostics)
      .toMatchInlineSnapshot(`
      [
        {
          "code": 2322,
          "from": 3,
          "level": "error",
          "text": "Not assignable.",
          "to": 5,
        },
      ]
    `)
  })

  test('reads an error onto the source as written', async () => {
    const nodes = [
      // Spans one of the cuts, so its end shifts further than its start.
      {
        code: 2322,
        length: 6,
        level: 'error' as const,
        start: 3,
        text: 'Not assignable.',
        type: 'error',
      },
      // Severity is optional, and an absent one is an error.
      { code: 6133, length: 1, start: 0, text: 'Declared but never read.', type: 'error' },
      // So is the code, and an absent one is left absent rather than made up.
      { length: 1, start: 1, text: 'Unnumbered.', type: 'error' },
    ]
    // In source order, whatever order the compiler reported them in.
    expect(Twoslash.annotate({ ...input, nodes }).diagnostics).toMatchInlineSnapshot(`
      [
        {
          "code": 6133,
          "from": 0,
          "level": "error",
          "text": "Declared but never read.",
          "to": 1,
        },
        {
          "from": 1,
          "level": "error",
          "text": "Unnumbered.",
          "to": 2,
        },
        {
          "code": 2322,
          "from": 3,
          "level": "error",
          "text": "Not assignable.",
          "to": 14,
        },
      ]
    `)
  })
})
