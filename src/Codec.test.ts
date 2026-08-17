import lzString from 'lz-string'

import * as Codec from './Codec.js'

const state = {
  background: '#1c1c1e',
  code: "import { createHighlighter } from 'shiki'\n\nconst a = 1\n",
  lang: 'typescript',
  padding: 96,
  radius: 8,
  syntax: 'github-dark',
  theme: 'github-dark',
  title: 'highlight.ts',
  titleBar: false,
  types: false,
  width: 720,
} satisfies Codec.State

describe('serialize', () => {
  test('round-trips every field', () => {
    expect(Codec.deserialize(Codec.serialize(state))).toEqual(state)
  })

  test('fills what a caller leaves out', () => {
    expect(Codec.deserialize(Codec.serialize({ code: 'const a = 1' }))).toMatchInlineSnapshot(`
      {
        "background": "default",
        "code": "const a = 1",
        "lang": "auto",
        "padding": 64,
        "radius": 12,
        "syntax": "auto",
        "theme": "golden-gate-dark",
        "title": "",
        "titleBar": false,
        "types": true,
        "width": undefined,
      }
    `)
  })

  test('writes a fragment safe to put in a URL', () => {
    const hash = Codec.serialize(state)
    expect({
      encodes: encodeURIComponent(hash) === hash,
      shorterThanJson: hash.length < JSON.stringify(state).length,
    }).toMatchInlineSnapshot(`
      {
        "encodes": true,
        "shorterThanJson": true,
      }
    `)
  })
})

describe('readable', () => {
  test('reads a fragment this codec wrote', () => {
    expect(Codec.readable(Codec.serialize(state))).toBe(true)
  })

  test('reports that unreadable fragments contain no shared state', () => {
    expect(Codec.readable('')).toBe(false)
    expect(Codec.readable('#')).toBe(false)
    expect(Codec.readable('#garbage')).toBe(false)
    // Compressed, and not an object once unpacked.
    expect(Codec.readable(`#${lzString.compressToEncodedURIComponent('"a string"')}`)).toBe(false)
  })
})

describe('deserialize', () => {
  test('reads a fragment with or without its leading hash', () => {
    const hash = Codec.serialize(state)
    expect(Codec.deserialize(`#${hash}`)).toEqual(Codec.deserialize(hash))
  })

  test('falls back rather than throwing on a fragment it cannot read', () => {
    const truncated = Codec.serialize(state).slice(0, 12)
    expect([
      Codec.deserialize('').theme,
      Codec.deserialize('not-a-fragment').theme,
      Codec.deserialize(truncated).theme,
    ]).toMatchInlineSnapshot(`
      [
        "golden-gate-dark",
        "golden-gate-dark",
        "golden-gate-dark",
      ]
    `)
  })

  test('falls back per field, keeping the ones it can read', () => {
    // Hand-built rather than round-tripped: `serialize` validates, so a bad
    // field can only reach `deserialize` from a link someone edited.
    const hash = lzString.compressToEncodedURIComponent(
      JSON.stringify({ c: 'const a = 1', g: 'rust', t: 42, w: 'wide', y: 'yes' }),
    )
    expect(Codec.deserialize(hash)).toMatchInlineSnapshot(`
      {
        "background": "default",
        "code": "const a = 1",
        "lang": "rust",
        "padding": 64,
        "radius": 12,
        "syntax": "auto",
        "theme": "golden-gate-dark",
        "title": "",
        "titleBar": false,
        "types": true,
        "width": undefined,
      }
    `)
  })

  test('falls back on a backdrop the frame cannot paint', () => {
    const hash = (background: string) =>
      lzString.compressToEncodedURIComponent(JSON.stringify({ b: background }))
    expect([
      Codec.deserialize(hash('#1c1c1e')).background,
      Codec.deserialize(hash('gradient:#3f37c9:#8c87df')).background,
      Codec.deserialize(hash('none')).background,
      Codec.deserialize(hash('red')).background,
      Codec.deserialize(hash('#bogus')).background,
      Codec.deserialize(hash('#fff')).background,
    ]).toMatchInlineSnapshot(`
      [
        "#1c1c1e",
        "gradient:#3f37c9:#8c87df",
        "none",
        "default",
        "default",
        "default",
      ]
    `)
  })

  test('refuses a fragment that expands past what is worth parsing', () => {
    // A link someone else wrote: short enough to send, large enough decoded to
    // block the tab that opens it.
    const bomb = lzString.compressToEncodedURIComponent(
      JSON.stringify({ c: 'a'.repeat(1_000_000) }),
    )
    const honest = lzString.compressToEncodedURIComponent(JSON.stringify({ c: 'a'.repeat(1000) }))
    expect({
      bombFragment: bomb.length,
      bombOpensOn: Codec.deserialize(bomb).code.length,
      honestOpensOn: Codec.deserialize(honest).code.length,
    }).toMatchInlineSnapshot(`
      {
        "bombFragment": 2286,
        "bombOpensOn": 0,
        "honestOpensOn": 1000,
      }
    `)
  })

  test('refuses an overlong fragment before decompressing it', () => {
    // Use varied input that does not compress enough to avoid the fragment
    // over the limit rather than what it decodes to.
    const noise = Array.from({ length: 30_000 }, (_, index) => index.toString(36)).join(' ')
    const overlong = lzString.compressToEncodedURIComponent(JSON.stringify({ c: noise }))
    expect({
      fragment: overlong.length,
      opensOn: Codec.deserialize(overlong).code.length,
    }).toMatchInlineSnapshot(`
      {
        "fragment": 111869,
        "opensOn": 0,
      }
    `)
  })

  test('rejects sizes outside what the frame can render', () => {
    const wide = Codec.deserialize(Codec.serialize({ ...state, width: 9000 }))
    const negative = Codec.deserialize(Codec.serialize({ ...state, padding: -20 }))
    expect({ padding: negative.padding, width: wide.width }).toMatchInlineSnapshot(`
      {
        "padding": 64,
        "width": undefined,
      }
    `)
  })

  test('keeps the fixed width carried by an existing link', () => {
    const hash = lzString.compressToEncodedURIComponent(
      JSON.stringify({ c: 'const a = 1', w: 640 }),
    )
    expect(Codec.deserialize(hash).width).toBe(640)
  })
})

describe('strict', () => {
  test('reads a whole frame that leaves its width to the rendered lines', () => {
    // The shape `deserialize` returns for a link carrying no width.
    const read = Codec.strict.safeParse({ ...state, width: undefined })
    expect({ success: read.success, width: read.data?.width }).toMatchInlineSnapshot(`
      {
        "success": true,
        "width": undefined,
      }
    `)
  })

  test('refuses a value the lenient reading would replace', () => {
    const read = Codec.strict.safeParse({ ...state, radius: 99 })
    expect(read.success ? [] : read.error.issues.map((issue) => issue.path.join('.')))
      .toMatchInlineSnapshot(`
      [
        "radius",
      ]
    `)
  })
})
