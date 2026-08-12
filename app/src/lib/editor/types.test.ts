import { EditorState } from '@codemirror/state'

import { at, setTypes, types } from './types.js'
import type { Types } from './types.js'

const doc = 'const alpha = 1\nconst beta = 2\n'

/** `alpha` and `beta`, each carrying a type standing in for its tokens. */
const resolved: Types = [
  { annotation: [[{ content: 'number', offset: 0 }]], from: 6, to: 11 },
  { annotation: [[{ content: 'number', offset: 0 }]], from: 22, to: 26 },
]

function editor(text = doc) {
  const state = EditorState.create({ doc: text, extensions: [types] })
  return state.update({ effects: setTypes.of(resolved) }).state
}

/** The spans as text, so a snapshot reads as what each one now covers. */
function covers(state: EditorState) {
  return state.field(types).map((span) => state.doc.sliceString(span.from, span.to))
}

describe('types', () => {
  test('holds the spans it was given', () => {
    expect(covers(editor())).toMatchInlineSnapshot(`
      [
        "alpha",
        "beta",
      ]
    `)
  })

  test('follows an insertion made before a span', () => {
    const state = editor().update({ changes: { from: 0, insert: '// note\n' } }).state
    expect(covers(state)).toMatchInlineSnapshot(`
      [
        "alpha",
        "beta",
      ]
    `)
  })

  test('follows a deletion made before a span', () => {
    const state = editor().update({ changes: { from: 0, to: 6 } }).state
    expect(covers(state)).toMatchInlineSnapshot(`
      [
        "alpha",
        "beta",
      ]
    `)
  })

  test('keeps a span off text typed against its edges', () => {
    const state = editor().update({ changes: { from: 11, insert: 'X' } }).state
    expect(covers(state)).toMatchInlineSnapshot(`
      [
        "alpha",
        "beta",
      ]
    `)
  })

  test('drops a span whose text was deleted', () => {
    const state = editor().update({ changes: { from: 6, to: 11 } }).state
    expect(covers(state)).toMatchInlineSnapshot(`
      [
        "beta",
      ]
    `)
  })

  test('replaces the spans when a new result arrives', () => {
    const state = editor().update({ effects: setTypes.of([]) }).state
    expect(covers(state)).toMatchInlineSnapshot(`[]`)
  })
})

describe('at', () => {
  test('finds the span covering an offset', () => {
    expect(at(editor(), 8)?.from).toMatchInlineSnapshot(`6`)
  })

  test('returns no type between spans', () => {
    expect(at(editor(), 15)).toMatchInlineSnapshot(`undefined`)
  })

  test('finds a span at the offset an edit moved it to', () => {
    const state = editor().update({ changes: { from: 0, insert: '// note\n' } }).state
    expect(at(state, 8)).toMatchInlineSnapshot(`undefined`)
    expect(
      state.doc.sliceString(at(state, 16)?.from ?? 0, at(state, 16)?.to ?? 0),
    ).toMatchInlineSnapshot(`"alpha"`)
  })
})
