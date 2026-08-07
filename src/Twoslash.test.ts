import * as Twoslash from './Twoslash.js'

const source = `const greeting = 'hello'
//    ^?
const count: number = greeting.length
//                    ^?
`

describe('run', () => {
  test('resolves the types a snippet asks for', () => {
    const result = Twoslash.run(source)
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
    const result = Twoslash.run(source)
    expect(result.queries.map((query) => source.slice(query.from, query.to)))
      .toMatchInlineSnapshot(`
      [
        "greeting",
        "greeting",
      ]
    `)
  })

  test('knows types nothing asked about, which is what a hover needs', () => {
    const result = Twoslash.run(source)
    const found = result.hovers.find((hover) => hover.name === 'length')
    expect({ name: found?.name, text: found?.text }).toMatchInlineSnapshot(`
      {
        "name": "length",
        "text": "(property) String.length: number",
      }
    `)
  })

  test('resolves a snippet carrying no notations at all', () => {
    const result = Twoslash.run('const a = 1')
    expect({ hovers: result.hovers.length, queries: result.queries.length }).toMatchInlineSnapshot(`
      {
        "hovers": 1,
        "queries": 0,
      }
    `)
  })

  test('reports what it can for code that does not compile', () => {
    const result = Twoslash.run("const a: number = 'x'\nconst b = a\n//        ^?")
    expect(result.queries.map((query) => query.text)).toMatchInlineSnapshot(`
      [
        "const a: number",
      ]
    `)
  })
})

describe('raw', () => {
  test('shifts an offset past every notation cut before it', () => {
    // Twoslash reports removals in the order it found them, and each cut moves
    // the ones after it, so applying them out of order skips cuts that the
    // accumulated offset has already reached. Sorted this is 28, not 23.
    const unsorted = [
      [20, 25],
      [5, 10],
    ] as const
    expect({
      before: Twoslash.raw(3, unsorted),
      between: Twoslash.raw(7, unsorted),
      past: Twoslash.raw(18, unsorted),
    }).toMatchInlineSnapshot(`
      {
        "before": 3,
        "between": 12,
        "past": 28,
      }
    `)
  })

  test('leaves an offset alone when nothing was cut', () => {
    expect(Twoslash.raw(12, [])).toMatchInlineSnapshot(`12`)
  })
})
