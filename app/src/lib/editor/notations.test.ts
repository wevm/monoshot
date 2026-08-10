import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { notations, removed } from './notations.js'

/** The class each line ends up with, which is what this field decides. */
function marked(doc: string) {
  const state = EditorState.create({ doc, extensions: [notations] })
  const found: Record<number, string[]> = {}
  for (const set of state.facet(EditorView.decorations)) {
    if (typeof set === 'function') continue
    set.between(0, state.doc.length, (from, _to, value) => {
      const attributes = value.spec.class ?? value.spec.attributes?.class
      if (!attributes) return
      const line = state.doc.lineAt(from).number
      found[line] = [...(found[line] ?? []), attributes]
    })
  }
  return found
}

describe('notations', () => {
  test('marks the line a trailing notation sits on', () => {
    expect(marked('const a = 1 // [!code hl]\nconst b = 2\n')).toMatchInlineSnapshot(`
      {
        "1": [
          "cm-mark-highlight",
          "cm-notation",
        ],
      }
    `)
  })

  test('marks the line a notation of its own precedes', () => {
    expect(marked('// [!code ++]\nconst a = 1\n')).toMatchInlineSnapshot(`
      {
        "1": [
          "cm-notation",
        ],
        "2": [
          "cm-mark-add",
        ],
      }
    `)
  })

  test('reaches as far down as the notation asks', () => {
    expect(marked('// [!code hl:2]\nconst a = 1\nconst b = 2\nconst c = 3\n'))
      .toMatchInlineSnapshot(`
      {
        "1": [
          "cm-notation",
        ],
        "2": [
          "cm-mark-highlight",
        ],
        "3": [
          "cm-mark-highlight",
        ],
      }
    `)
  })

  test('recedes every line focus left out', () => {
    expect(marked('const a = 1 // [!code focus]\nconst b = 2\n')).toMatchInlineSnapshot(`
      {
        "1": [
          "cm-mark-focus",
          "cm-notation",
        ],
        "2": [
          "cm-mark-blur",
        ],
        "3": [
          "cm-mark-blur",
        ],
      }
    `)
  })

  test('reads a notation in the comment syntax the snippet is written in', () => {
    expect(marked('body { color: red } /* [!code hl] */\n#!/bin/sh # [!code ++]\n'))
      .toMatchInlineSnapshot(`
        {
          "1": [
            "cm-mark-highlight",
            "cm-notation",
          ],
          "2": [
            "cm-mark-add",
            "cm-notation",
          ],
        }
      `)
  })

  test('leaves a comment that only looks like one alone', () => {
    expect(marked('// [!code nonsense]\nconst a = 1\n')).toMatchInlineSnapshot(`{}`)
  })

  test('drops a line holding nothing but a notation', () => {
    const state = EditorState.create({
      doc: '// [!code hl]\nconst a = 1\nconst b = 2 // [!code ++]\n',
      extensions: [notations],
    })
    // The export removes it, so the editor stops counting it.
    expect(removed(state)).toMatchInlineSnapshot(`
      [
        1,
      ]
    `)
  })

  test('keeps a line whose notation trails its code', () => {
    const state = EditorState.create({
      doc: 'const a = 1 // [!code hl]\n',
      extensions: [notations],
    })
    expect(removed(state)).toMatchInlineSnapshot(`[]`)
  })
})
