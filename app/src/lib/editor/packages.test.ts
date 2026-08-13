import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { at, packages, references, setLoading } from './packages.js'

function widgets(state: EditorState) {
  const found: number[] = []
  for (const set of state.facet(EditorView.decorations)) {
    if (typeof set === 'function') continue
    set.between(0, state.doc.length, (from, _to, value) => {
      if (value.spec.widget) found.push(from)
    })
  }
  return found
}

describe('references', () => {
  test('finds bare packages across import forms', () => {
    const code = [
      "import { codeToHtml } from 'shiki/core'",
      "import '@scope/theme/register'",
      "export { thing } from 'package'",
      "const lazy = import('lazy/subpath')",
      "const common = require('common')",
    ].join('\n')
    expect(references(code).map(({ name }) => name)).toMatchInlineSnapshot(`
      [
        "shiki",
        "@scope/theme",
        "package",
        "lazy",
        "common",
      ]
    `)
  })

  test('ignores relative, builtin, mapped, and URL imports', () => {
    const code = [
      "import './local.js'",
      "import 'node:path'",
      "import '#internal'",
      "import 'https://example.com/module.js'",
    ].join('\n')
    expect(references(code)).toEqual([])
  })

  test('points at the package specifier', () => {
    const code = "import { a } from 'one'"
    expect(references(code)).toEqual([{ from: 19, name: 'one', to: 22 }])
  })
})

describe('packages', () => {
  test('decorates the end of an import line while its package loads', () => {
    const code = "import { a } from 'one'\nimport { b } from 'two'"
    const state = EditorState.create({ doc: code, extensions: [packages] }).update({
      effects: setLoading.of(['one']),
    }).state
    expect(widgets(state)).toEqual([state.doc.line(1).to])
  })

  test('finds the package imported on a line', () => {
    const state = EditorState.create({
      doc: "import { a } from 'one/subpath'\n",
      extensions: [packages],
    })
    expect(at(state, 1)).toEqual({ from: 19, name: 'one', to: 30 })
  })
})
