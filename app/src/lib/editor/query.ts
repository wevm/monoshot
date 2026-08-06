import { StateEffect, StateField } from '@codemirror/state'
import type { Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

/** Sets the type a `^?` query resolves to, or clears it. */
export const setQuery = StateEffect.define<string | undefined>()

/**
 * Replaces a `^?` comment line with the type it asks about. The line is not
 * code, so it is replaced rather than decorated, and the block sits in flow so
 * an export carries it the same way the editor shows it.
 */
export const query = StateField.define<Value>({
  create: () => ({ decorations: Decoration.none, type: undefined }),
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setQuery))
        return { decorations: build(transaction.state.doc, effect.value), type: effect.value }
    if (!transaction.docChanged) return value
    // A caret line can appear or move with any edit, so the set is rebuilt
    // rather than mapped; only its answer arrives out of band.
    return { decorations: build(transaction.state.doc, value.type), type: value.type }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

/** The answer rides with the decorations, so an edit can rebuild them. */
type Value = {
  decorations: DecorationSet
  type: string | undefined
}

const caret = /^(\s*\/\/\s*)\^\?\s*$/

function build(doc: Text, type: string | undefined): DecorationSet {
  if (!type) return Decoration.none
  const ranges = []
  for (let line = 1; line <= doc.lines; line++) {
    const text = doc.line(line)
    const match = caret.exec(text.text)
    if (!match) continue
    ranges.push(
      Decoration.replace({
        block: true,
        widget: new Block(type, match[1]?.length ?? 0),
      }).range(text.from, text.to),
    )
  }
  return Decoration.set(ranges, true)
}

class Block extends WidgetType {
  constructor(
    readonly type: string,
    readonly column: number,
  ) {
    super()
  }

  eq(other: Block) {
    return other.type === this.type && other.column === this.column
  }

  toDOM() {
    const root = document.createElement('div')
    root.className = 'twoslash-query'
    root.style.setProperty('--twoslash-column', String(this.column))
    const body = document.createElement('span')
    body.textContent = this.type
    root.appendChild(body)
    return root
  }
}
