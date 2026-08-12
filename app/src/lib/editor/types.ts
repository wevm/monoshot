import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'

import type * as Annotation from './annotation.js'

/** A type the language service resolved, over the span it belongs to. */
export type Span = {
  /** The type, tokenized so it paints like the code. */
  annotation: Annotation.Annotation
  /** Document offset the span starts at. */
  from: number
  /** Document offset the span ends at, one past its last character. */
  to: number
}

/**
 * Types for a document, as spans of it. Positions rather than names: two
 * variables sharing a name rarely share a type.
 */
export type Types = readonly Span[]

/** Carries a freshly resolved document's types into the editor. */
export const setTypes = StateEffect.define<Types>()

/**
 * The types the language service last resolved. Held as editor state so the
 * marks, hover, and pinned blocks share the same spans. Separate copies could
 * retain stale worker results.
 */
export const types = StateField.define<Types>({
  create: () => [],
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(setTypes)) return effect.value
    if (!transaction.docChanged) return value
    // Mapped rather than dropped: the spans belong to the document the language
    // service last saw, so they follow an edit until the next result lands. A
    // remove spans whose text was deleted by an edit.
    const mapped = []
    for (const span of value) {
      const from = transaction.changes.mapPos(span.from, 1)
      const to = transaction.changes.mapPos(span.to, -1)
      if (to > from) mapped.push({ annotation: span.annotation, from, to })
    }
    return mapped
  },
})

/**
 * Whether a resolved type overlaps a range. Adjacent diagnostics do not count
 * because diagnostic end offsets are exclusive.
 */
export function over(state: EditorState, range: { from: number; to: number }): boolean {
  return state.field(types).some((span) => span.from < range.to && range.from < span.to)
}

/** The type covering a document offset, if one is known. */
export function at(state: EditorState, pos: number): Span | undefined {
  return state.field(types).find((span) => pos >= span.from && pos <= span.to)
}
