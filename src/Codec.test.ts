import lzString from 'lz-string'

import * as Codec from './Codec.js'

const state = {
  background: '#1c1c1e',
  code: "import { createHighlighter } from 'shiki'\n\nconst a = 1\n",
  lang: 'typescript',
  lineNumbers: true,
  padding: 96,
  radius: 8,
  theme: 'github-dark',
  title: 'highlight.ts',
  titleBar: false,
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
        "lineNumbers": false,
        "padding": 64,
        "radius": 12,
        "theme": "vitesse-dark",
        "title": "",
        "titleBar": true,
        "width": 640,
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
        "vitesse-dark",
        "vitesse-dark",
        "vitesse-dark",
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
        "lineNumbers": false,
        "padding": 64,
        "radius": 12,
        "theme": "vitesse-dark",
        "title": "",
        "titleBar": true,
        "width": 640,
      }
    `)
  })

  test('falls back on a backdrop the frame cannot paint', () => {
    const hash = (background: string) =>
      lzString.compressToEncodedURIComponent(JSON.stringify({ b: background }))
    expect([
      Codec.deserialize(hash('#1c1c1e')).background,
      Codec.deserialize(hash('none')).background,
      Codec.deserialize(hash('red')).background,
      Codec.deserialize(hash('#bogus')).background,
      Codec.deserialize(hash('#fff')).background,
    ]).toMatchInlineSnapshot(`
      [
        "#1c1c1e",
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

  test('rejects sizes outside what the frame can render', () => {
    const wide = Codec.deserialize(Codec.serialize({ ...state, width: 9000 }))
    const negative = Codec.deserialize(Codec.serialize({ ...state, padding: -20 }))
    expect({ padding: negative.padding, width: wide.width }).toMatchInlineSnapshot(`
      {
        "padding": 64,
        "width": 640,
      }
    `)
  })
})
