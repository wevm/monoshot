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
  test('resolves the types a snippet asks for', () => {
    const result = twoslash.run(source)
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

  test('points a query at the identifier in the source as written', () => {
    // The positions are useless unless they index the text the caller holds,
    // which still has its notation lines in it.
    const result = twoslash.run(source)
    expect(result.queries.map((query) => source.slice(query.from, query.to)))
      .toMatchInlineSnapshot(`
      [
        "greeting",
        "greeting",
      ]
    `)
  })

  test('knows types nothing asked about, which is what a hover needs', () => {
    const result = twoslash.run(source)
    const found = result.hovers.find((hover) => hover.name === 'length')
    expect({ name: found?.name, text: found?.text }).toMatchInlineSnapshot(`
      {
        "name": "length",
        "text": "(property) String.length: number",
      }
    `)
  })

  test('resolves a snippet carrying no notations at all', () => {
    const result = twoslash.run('const a = 1')
    expect({ hovers: result.hovers.length, queries: result.queries.length }).toMatchInlineSnapshot(`
      {
        "hovers": 1,
        "queries": 0,
      }
    `)
  })

  test('reports what it can for code that does not compile', () => {
    const result = twoslash.run("const a: number = 'x'\nconst b = a\n//        ^?")
    expect(result.queries.map((query) => query.text)).toMatchInlineSnapshot(`
      [
        "const a: number",
      ]
    `)
  })

  test('reads a snippet in the language it was asked for', () => {
    const result = twoslash.run('const a = 1\n//    ^?', { lang: 'js' })
    expect(result.queries.map((query) => query.text)).toMatchInlineSnapshot(`
      [
        "const a: 1",
      ]
    `)
  })
})

describe('run', () => {
  test('resolves a snippet without a resolver to hold on to', () => {
    const result = Twoslash.run("const a = 'x'\n//    ^?")
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

  test('shifts every offset past the notation cuts before it', () => {
    expect(Twoslash.annotate(input)).toMatchInlineSnapshot(`
      {
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

  test('leaves offsets alone when nothing was cut', () => {
    expect(Twoslash.annotate({ ...input, meta: { removals: [] } })).toMatchInlineSnapshot(`
      {
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

  test('skips the node kinds it has nothing to say about', () => {
    const nodes = [
      { length: 1, start: 0, text: 'Type error', type: 'error' },
      { length: 1, start: 1, type: 'completion' },
      { length: 1, start: 2, text: 'a note', type: 'highlight' },
      // A hover the language service resolved no type for.
      { length: 1, start: 3, type: 'hover' },
    ]
    expect(Twoslash.annotate({ ...input, nodes })).toMatchInlineSnapshot(`
      {
        "hovers": [],
        "queries": [],
      }
    `)
  })
})
