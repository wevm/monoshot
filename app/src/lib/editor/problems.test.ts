import { EditorState } from '@codemirror/state'
import type * as Twoslash from 'monoshot/twoslash'

import { objection, problems } from './problems.js'

const doc = 'const a = 1'

/** The ranges the editor is asked to mark, which is what this adapter decides. */
function ranges(text: string, diagnostics: readonly Partial<Twoslash.Diagnostic>[]) {
  const state = EditorState.create({ doc: text })
  const spec = problems(
    state,
    diagnostics.map((diagnostic) => ({
      from: 0,
      level: 'error' as const,
      text: 'message',
      to: 1,
      ...diagnostic,
    })),
  )
  const effects = Array.isArray(spec.effects) ? spec.effects : [spec.effects]
  const found = effects.find((effect) => Array.isArray(effect?.value))
  return (found?.value as { from: number; severity: string; to: number }[]).map((entry) => ({
    from: entry.from,
    severity: entry.severity,
    to: entry.to,
  }))
}

describe('problems', () => {
  test('marks the span the compiler reported', () => {
    expect(ranges(doc, [{ from: 6, to: 7 }])).toMatchInlineSnapshot(`
      [
        {
          "from": 6,
          "severity": "error",
          "to": 7,
        },
      ]
    `)
  })

  test('keeps a complaint that lands past the last character', () => {
    // An unfinished snippet reports at the very end, where there is no
    // character left to mark, so it takes the one before it.
    expect(ranges(doc, [{ from: doc.length, to: doc.length }])).toMatchInlineSnapshot(`
      [
        {
          "from": 10,
          "severity": "error",
          "to": 11,
        },
      ]
    `)
  })

  test('widens a zero-width span so it has something to draw on', () => {
    expect(ranges(doc, [{ from: 4, to: 4 }])).toMatchInlineSnapshot(`
      [
        {
          "from": 4,
          "severity": "error",
          "to": 5,
        },
      ]
    `)
  })

  test('clamps a span resolved against longer text', () => {
    expect(ranges(doc, [{ from: 40, to: 60 }])).toMatchInlineSnapshot(`
      [
        {
          "from": 10,
          "severity": "error",
          "to": 11,
        },
      ]
    `)
  })

  test('marks nothing in an empty document, which has nowhere to draw', () => {
    expect(ranges('', [{ from: 0, to: 0 }])).toMatchInlineSnapshot(`[]`)
  })

  test('carries every severity into the editor vocabulary', () => {
    const levels = ['error', 'warning', 'suggestion', 'message'] as const
    expect(
      ranges(
        doc,
        levels.map((level) => ({ from: 0, level, to: 1 })),
      ).map((r) => r.severity),
    ).toMatchInlineSnapshot(`
      [
        "error",
        "warning",
        "hint",
        "info",
      ]
    `)
  })
})

describe('objection', () => {
  /** A state carrying the marks the editor would draw for these complaints. */
  function marked(text: string, diagnostics: readonly Partial<Twoslash.Diagnostic>[]) {
    const start = EditorState.create({ doc: text })
    return start.update(
      problems(
        start,
        diagnostics.map((diagnostic) => ({
          from: 0,
          level: 'error' as const,
          text: 'message',
          to: 1,
          ...diagnostic,
        })),
      ),
    ).state
  }

  test('finds the complaint a span sits under', () => {
    // `a`, which the complaint covers exactly.
    expect(objection(marked(doc, [{ from: 6, to: 7 }]), { from: 6, to: 7 })).toBe(true)
  })

  test('finds a complaint covering part of a span', () => {
    expect(objection(marked(doc, [{ from: 4, to: 7 }]), { from: 6, to: 11 })).toBe(true)
  })

  test('leaves a span the complaint only reaches', () => {
    // The complaint ends where the span starts, so it sits beside it.
    expect(objection(marked(doc, [{ from: 0, to: 6 }]), { from: 6, to: 7 })).toBe(false)
  })

  test('leaves a span nothing was reported against', () => {
    expect(objection(marked(doc, [{ from: 0, to: 5 }]), { from: 6, to: 7 })).toBe(false)
  })

  test('leaves every span when the compiler reported nothing', () => {
    expect(objection(marked(doc, []), { from: 6, to: 7 })).toBe(false)
  })
})
