import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import * as Annotation from './annotation.js'
import * as Identifier from './identifier.js'
import { type as lookup } from './hover.js'
import type { Types } from './hover.js'

/** Sets the types a `^?` caret can resolve to, keyed by identifier. */
export const setQuery = StateEffect.define<Types>()

/**
 * Replaces a `^?` comment line with the type it asks about. The line is not
 * code, so it is replaced rather than decorated, and the block sits in flow so
 * an export carries it the same way the editor shows it.
 */
export const query = StateField.define<Value>({
  create: () => ({ decorations: Decoration.none, lines: [], types: [] }),
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setQuery)) return build(transaction.state.doc, effect.value)
    if (!transaction.docChanged) return value
    // A caret line can appear or move with any edit, so the set is rebuilt
    // rather than mapped; only the types arrive out of band.
    return build(transaction.state.doc, value.types)
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    // A replaced line still holds its characters, so without this the caret
    // walks into the hidden `^?` and Backspace corrupts it unseen.
    EditorView.atomicRanges.of((view) => view.state.field(field).decorations),
  ],
})

/**
 * The number a line shows in the gutter. A pinned type stands in for its `^?`
 * line, so that line takes no number and the code after it keeps counting.
 */
export function number(line: number, state: EditorState): string {
  const { lines } = state.field(query)
  if (lines.includes(line)) return ''
  return String(line - lines.filter((pinned) => pinned < line).length)
}

/** The types ride with the decorations, so an edit can rebuild them. */
type Value = {
  decorations: DecorationSet
  /** Document lines a pinned type replaced, in order. */
  lines: readonly number[]
  types: Types
}

function build(doc: Text, types: Types): Value {
  const ranges = []
  const lines = []
  for (let line = 1; line <= doc.lines; line++) {
    const text = doc.line(line)
    const column = Identifier.caretColumn(text.text)
    if (column === undefined) continue
    // A caret pointing at nothing stays the comment it is, rather than
    // collapsing into an empty box.
    // The caret addresses the line above, which is where the type belongs.
    const above = line > 1 ? doc.line(line - 1) : undefined
    const target = above && above.from + Math.min(column, above.length)
    const found = target === undefined ? undefined : lookup(types, target)
    if (!found) continue
    const type = found.annotation
    lines.push(line)
    ranges.push(
      Decoration.replace({ block: true, widget: new Block(type, column) }).range(
        text.from,
        text.to,
      ),
    )
  }
  return { decorations: Decoration.set(ranges, true), lines, types }
}

class Block extends WidgetType {
  constructor(
    readonly type: Annotation.Annotation,
    readonly column: number,
  ) {
    super()
  }

  eq(other: Block) {
    return other.type === this.type && other.column === this.column
  }

  toDOM(view: EditorView) {
    const root = document.createElement('div')
    root.className = 'twoslash-block'
    root.style.setProperty('--twoslash-column', String(this.column))
    root.appendChild(
      Annotation.element(this.type, {
        label: 'Unpin this type',
        // The widget stands in for the caret line, so its own position is the
        // line to take away.
        select: () => {
          const pos = view.posAtDOM(root)
          const line = view.state.doc.lineAt(pos)
          view.dispatch({ changes: { from: Math.max(0, line.from - 1), to: line.to } })
        },
      }),
    )
    return root
  }

  /**
   * Repaints rather than rebuilds, so pinning one type does not replay the
   * entrance of every type already pinned.
   */
  updateDOM(dom: HTMLElement) {
    if (this.column !== Number(dom.style.getPropertyValue('--twoslash-column'))) return false
    const surface = dom.firstElementChild
    if (!(surface instanceof HTMLElement)) return false
    Annotation.paint(surface, this.type)
    return true
  }
}
