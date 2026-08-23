import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { query, setPending } from './query.js'
import { setTypes } from './types.js'

vi.mock('./annotation.js', () => ({ element: vi.fn(), paint: vi.fn() }))

function replacements(state: EditorState) {
  const found: [number, number][] = []
  for (const set of state.facet(EditorView.decorations)) {
    if (typeof set === 'function') continue
    set.between(0, state.doc.length, (from, to) => {
      found.push([from, to])
    })
  }
  return found
}

function blocks(state: EditorState) {
  let found = 0
  for (const set of state.facet(EditorView.decorations)) {
    if (typeof set === 'function') continue
    set.between(0, state.doc.length, (_from, _to, value) => {
      if (value.spec.widget) found += 1
    })
  }
  return found
}

describe('query', () => {
  test('hides caret queries while types are pending', () => {
    const state = EditorState.create({
      doc: 'const answer = 42\n//     ^?',
      extensions: query(true),
    })

    expect(replacements(state)).toEqual([[18, 27]])
  })

  test('restores unresolved caret queries when loading finishes', () => {
    const state = EditorState.create({
      doc: 'const answer = 42\n//     ^?',
      extensions: query(true),
    })
    const ready = state.update({ effects: setPending.of(false) }).state

    expect(replacements(ready)).toEqual([])
  })

  test('keeps a resolved query while a focus edit refreshes types', () => {
    const state = EditorState.create({
      doc: 'const answer = 42\n//     ^?',
      extensions: query(),
    })
      .update({
        effects: setTypes.of([
          {
            annotation: [[{ content: 'number', offset: 0 }]],
            from: 6,
            to: 12,
          },
        ]),
      })
      .state.update({ changes: { from: 0, insert: '// [!code focus]\n' } })
      .state.update({ effects: setPending.of(true) }).state

    expect(blocks(state)).toBe(1)
  })
})
