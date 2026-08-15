import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import {
  bare,
  notations,
  removed,
  syntax,
  tagAt,
  takesTag,
  takesMark,
  toggle,
  toggleTag,
} from './notations.js'

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
        ],
      }
    `)
  })

  test('marks the line a notation of its own precedes', () => {
    expect(marked('// [!code ++]\nconst a = 1\n')).toMatchInlineSnapshot(`
      {
        "1": [
          "cm-gone",
        ],
        "2": [
          "cm-mark-add",
        ],
      }
    `)
  })

  test('applies a notation across its requested line count', () => {
    expect(marked('// [!code hl:2]\nconst a = 1\nconst b = 2\nconst c = 3\n'))
      .toMatchInlineSnapshot(`
        {
          "1": [
            "cm-gone",
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

  test('keeps the mark on a line focus left out', () => {
    // The mark is the louder claim: a highlighted line reads as highlighted
    // whether or not focus reached it.
    expect(marked('const a = 1 // [!code focus]\nconst b = 2 // [!code hl]\n'))
      .toMatchInlineSnapshot(`
        {
          "1": [
            "cm-mark-focus",
          ],
          "2": [
            "cm-mark-highlight",
          ],
          "3": [
            "cm-mark-blur",
          ],
        }
      `)
  })

  test('recedes every line focus left out', () => {
    expect(marked('const a = 1 // [!code focus]\nconst b = 2\n')).toMatchInlineSnapshot(`
      {
        "1": [
          "cm-mark-focus",
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

  test('marks a line by the last notation on it, as shiki reads it', () => {
    // Every one is still taken out of view: none of them is code, whether or
    // not it is the one that marks the line.
    expect(marked('const a = 1 // [!code hl] // [!code ++]\n')).toMatchInlineSnapshot(`
      {
        "1": [
          "cm-mark-add",
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
          ],
          "2": [
            "cm-mark-add",
          ],
        }
      `)
  })

  test('reads a twoslash tag as the prose the export draws', () => {
    expect(marked('// @log: looked at\nconst a = 1\n')).toMatchInlineSnapshot(`
      {
        "1": [
          "cm-tag-log",
        ],
      }
    `)
  })

  test('leaves a comment that only looks like one alone', () => {
    expect(marked('// [!code nonsense]\nconst a = 1\n')).toMatchInlineSnapshot(`{}`)
  })

  test('removes a notation-only line', () => {
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

describe('notations', () => {
  test('hides a notation on the line the caret sits on', () => {
    const doc = 'const a = 1 // [!code hl]\n'
    const state = EditorState.create({ doc, extensions: [notations] })
    // The comment is the mark rather than something to look at, so the caret
    // being on its line does not bring it back.
    const shown = state.facet(EditorView.decorations).flatMap((set) => {
      if (typeof set === 'function') return []
      const spans: [number, number][] = []
      set.between(0, doc.length, (from, to, value) => {
        if (value.spec.class || value.spec.attributes) return
        spans.push([from, to])
      })
      return spans
    })
    expect(shown).toMatchInlineSnapshot(`
      [
        [
          11,
          25,
        ],
      ]
    `)
    expect(doc.slice(11, 25)).toMatchInlineSnapshot(`" // [!code hl]"`)
  })
})

describe('toggle', () => {
  /** The document a control leaves behind. */
  function pressed(doc: string, options: Parameters<typeof toggle>[1]) {
    const state = EditorState.create({ doc, extensions: [notations] })
    return state.update({ changes: toggle(state, options) }).state.doc.toString()
  }

  const line = { open: '//' }

  test('writes the mark a line does not carry', () => {
    expect(
      pressed('const a = 1\n', { kind: 'highlight', line: 1, syntax: line }),
    ).toMatchInlineSnapshot(
      `
      "const a = 1 // [!code hl]
      "
    `,
    )
  })

  test('takes back the mark a line does carry', () => {
    expect(pressed('const a = 1 // [!code hl]\n', { kind: 'highlight', line: 1, syntax: line }))
      .toMatchInlineSnapshot(`
      "const a = 1
      "
    `)
  })

  test('takes a line break with a notation that stood alone', () => {
    expect(pressed('// [!code ++]\nconst a = 1\n', { kind: 'add', line: 2, syntax: line }))
      .toMatchInlineSnapshot(`
      "const a = 1
      "
    `)
  })

  test('writes focus above the line, which keeps the mark it carries', () => {
    // Shiki reads one notation per line, so a line carrying both would lose one.
    expect(pressed('const a = 1 // [!code hl]\n', { kind: 'focus', line: 1, syntax: line }))
      .toMatchInlineSnapshot(`
      "// [!code focus]
      const a = 1 // [!code hl]
      "
    `)
  })

  test('takes off the mark of the axis the line owns', () => {
    expect(pressed('const a = 1 // [!code hl]\n', { kind: 'add', line: 1, syntax: line }))
      .toMatchInlineSnapshot(`
      "const a = 1 // [!code ++]
      "
    `)
  })

  test('takes off a mark written on a line of its own', () => {
    expect(pressed('// [!code hl]\nconst a = 1\n', { kind: 'add', line: 2, syntax: line }))
      .toMatchInlineSnapshot(`
      "const a = 1 // [!code ++]
      "
    `)
  })

  test('writes the comment the language of the snippet reads', () => {
    expect(pressed('a = 1\n', { kind: 'add', line: 1, syntax: syntax('python') }))
      .toMatchInlineSnapshot(`
      "a = 1 # [!code ++]
      "
    `)
    expect(pressed('a { color: red }\n', { kind: 'add', line: 1, syntax: syntax('css') }))
      .toMatchInlineSnapshot(`
      "a { color: red } /* [!code ++] */
      "
    `)
  })
})

describe('syntax', () => {
  test('falls back to a line comment for anything C-like', () => {
    expect([syntax('typescript'), syntax('rust'), syntax('elm')]).toMatchInlineSnapshot(`
      [
        {
          "open": "//",
        },
        {
          "open": "//",
        },
        {
          "open": "//",
        },
      ]
    `)
  })
})

describe('toggleTag', () => {
  function pressed(doc: string, options: Parameters<typeof toggleTag>[1]) {
    const state = EditorState.create({ doc, extensions: [notations] })
    return state.update({ changes: toggleTag(state, options) }).state.doc.toString()
  }

  test('adds a tag to a line comment in place', () => {
    expect(pressed('// hello\n', { line: 1, syntax: { open: '//' }, tag: 'log' })).toBe(
      '// @log: hello\n',
    )
    expect(pressed('//hello\n', { line: 1, syntax: { open: '//' }, tag: 'warn' })).toBe(
      '// @warn: hello\n',
    )
  })

  test('removes the active tag while preserving its comment', () => {
    expect(pressed('// @warn: careful\n', { line: 1, syntax: { open: '//' }, tag: 'warn' })).toBe(
      '// careful\n',
    )
  })

  test('switches the active tag', () => {
    expect(pressed('// @log: looked\n', { line: 1, syntax: { open: '//' }, tag: 'error' })).toBe(
      '// @error: looked\n',
    )
  })

  test('preserves a block comment closer', () => {
    expect(
      pressed('/* hello */\n', {
        line: 1,
        syntax: { close: '*/', open: '/*' },
        tag: 'annotate',
      }),
    ).toBe('/* @annotate: hello */\n')
  })
})

describe('takesTag', () => {
  test('accepts standalone comments and reports their active tag', () => {
    const state = EditorState.create({
      doc: '// hello\n// @log: result\nconst value = 1\n',
      extensions: [notations],
    })
    expect([1, 2, 3].map((line) => takesTag(state, line, { open: '//' }))).toEqual([
      true,
      true,
      false,
    ])
    expect(tagAt(state, 2)).toBe('log')
  })

  test('refuses notation and caret comments', () => {
    const state = EditorState.create({
      doc: '// [!code hl]\n// ^?\n',
      extensions: [notations],
    })
    expect([1, 2].map((line) => takesTag(state, line, { open: '//' }))).toEqual([false, false])
  })
})

describe('takesMark', () => {
  test('refuses a line that is already only a notation', () => {
    // Not code, so not something to mark: marking it would write a notation
    // above a notation.
    const state = EditorState.create({
      doc: '// [!code focus]\nconst a = 1\n',
      extensions: [notations],
    })
    expect([1, 2].map((line) => takesMark(state, line))).toMatchInlineSnapshot(`
      [
        false,
        true,
      ]
    `)
  })

  test('refuses a blank line, which a mark of its own would take away', () => {
    // Shiki reads a comment alone on a line as addressing the line after it,
    // and removes the line it sat on.
    const state = EditorState.create({ doc: 'const a = 1\n\n  \n', extensions: [notations] })
    expect([1, 2, 3].map((line) => takesMark(state, line))).toMatchInlineSnapshot(`
      [
        true,
        false,
        false,
      ]
    `)
  })
})

describe('bare', () => {
  test('leaves the snippet without what was written to mark it', () => {
    expect(
      bare(
        [
          '// [!code focus]',
          'const a = 1 // [!code hl]',
          '',
          '// @log: looked at',
          'const b = 2',
          '//    ^?',
          '',
        ].join('\n'),
      ),
    ).toMatchInlineSnapshot(`
      "const a = 1

      const b = 2
      "
    `)
  })

  test('leaves a snippet carrying no marks exactly as it was', () => {
    const code = 'const a = 1\n\nconst b = 2\n'
    expect(bare(code)).toBe(code)
  })
})
