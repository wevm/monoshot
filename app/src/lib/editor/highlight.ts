import { StateEffect, StateField } from '@codemirror/state'
import type { Text } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

/** One shiki token: the slice of source it covers, and how to paint it. */
export type Token = {
  color?: string | undefined
  content: string
  /** Shiki's bitfield: 1 italic, 2 bold, 4 underline. */
  fontStyle?: number | undefined
  /** Absolute offset into the document. */
  offset: number
}

/** Carries a freshly tokenized document into the editor. */
export const setTokens = StateEffect.define<readonly (readonly Token[])[]>()

/**
 * Colors the document from shiki tokens. Tokenizing is asynchronous, so between
 * an edit and the tokens that answer it the existing colors are mapped through
 * the change: text keeps its highlighting instead of flashing plain.
 */
export const highlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setTokens)) return build(effect.value, transaction.state.doc)
    return value.map(transaction.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

function build(lines: readonly (readonly Token[])[], doc: Text): DecorationSet {
  const ranges = []
  for (const line of lines)
    for (const token of line) {
      // Whitespace carries no color, and zero-width ranges are not valid marks.
      if (!token.content.trim()) continue
      const to = token.offset + token.content.length
      // Tokens can outlive the document that produced them by an edit or two.
      if (to > doc.length) return Decoration.set(ranges, true)
      ranges.push(mark(token).range(token.offset, to))
    }
  return Decoration.set(ranges, true)
}

// Bounded by the distinct color and style pairs across the loaded themes, so
// this stays in the low hundreds rather than growing with document size.
const marks = new Map<string, Decoration>()

function mark(token: Token): Decoration {
  const key = `${token.color ?? ''}:${token.fontStyle ?? 0}`
  const cached = marks.get(key)
  if (cached) return cached
  const style = token.fontStyle ?? 0
  const created = Decoration.mark({
    attributes: {
      style: [
        token.color && `color:${token.color}`,
        style & 1 && 'font-style:italic',
        style & 2 && 'font-weight:bold',
        style & 4 && 'text-decoration:underline',
      ]
        .filter(Boolean)
        .join(';'),
    },
  })
  marks.set(key, created)
  return created
}
