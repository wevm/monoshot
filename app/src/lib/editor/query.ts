import { StateEffect, StateField } from '@codemirror/state'
import type { Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import * as Annotation from './annotation.js'
import * as Identifier from './identifier.js'
import type { Types } from './hover.js'

/** Sets the types a `^?` caret can resolve to, keyed by identifier. */
export const setQuery = StateEffect.define<Types>()

/**
 * Replaces a `^?` comment line with the type it asks about. The line is not
 * code, so it is replaced rather than decorated, and the block sits in flow so
 * an export carries it the same way the editor shows it.
 */
export const query = StateField.define<Value>({
  create: () => ({ decorations: Decoration.none, types: {} }),
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setQuery))
        return { decorations: build(transaction.state.doc, effect.value), types: effect.value }
    if (!transaction.docChanged) return value
    // A caret line can appear or move with any edit, so the set is rebuilt
    // rather than mapped; only the types arrive out of band.
    return { decorations: build(transaction.state.doc, value.types), types: value.types }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

/** The types ride with the decorations, so an edit can rebuild them. */
type Value = {
  decorations: DecorationSet
  types: Types
}

function build(doc: Text, types: Types): DecorationSet {
  const ranges = []
  for (let line = 1; line <= doc.lines; line++) {
    const text = doc.line(line)
    const column = Identifier.caretColumn(text.text)
    if (column === undefined) continue
    // A caret pointing at nothing stays the comment it is, rather than
    // collapsing into an empty box.
    const type = types[Identifier.queried(doc, line, column)?.name ?? '']
    if (!type) continue
    ranges.push(
      Decoration.replace({ block: true, widget: new Block(type, column) }).range(
        text.from,
        text.to,
      ),
    )
  }
  return Decoration.set(ranges, true)
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

  toDOM() {
    const root = document.createElement('div')
    root.className = 'twoslash-block'
    root.style.setProperty('--twoslash-column', String(this.column))
    root.appendChild(Annotation.element(this.type))
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
