import { StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import * as Annotation from './annotation.js'
import * as Identifier from './identifier.js'

/** Types by identifier name, tokenized so they paint like the code. */
export type Types = Record<string, Annotation.Annotation>

/**
 * Shows an identifier's type on hover, and pins it on click. Pinning writes the
 * `^?` line twoslash reads, so a pin is part of the snippet rather than state
 * beside it: it survives a reload, and the export already knows how to draw it.
 */
export function hover(types: Types): Extension {
  return [
    marks(types),
    hoverTooltip(
      (view, pos) => {
        const identifier = Identifier.at(view.state.doc, pos)
        const type = identifier && types[identifier.name]
        if (!identifier || !type) return null
        // A pinned type is already on screen, so hovering it would only cover
        // the block it is asking about.
        if (pinned(view, identifier)) return null
        return {
          // Below the identifier, where pinning will leave it: hovering previews
          // the pinned block in place rather than somewhere else.
          above: false,
          // Offset belongs on the view, not the spec: CodeMirror reads it off
          // what `create` returns. Back by the notch's own inset, so the notch
          // lands on the token rather than a few characters into it.
          create: () => ({
            dom: Annotation.element(type, {
              label: 'Pin this type',
              select: () => toggle(view, identifier),
            }),
            offset: { x: -8, y: 4 },
          }),
          end: identifier.to,
          pos: identifier.from,
        }
      },
      // The types are already in hand, so waiting only makes the editor feel
      // slower than it is. One millisecond rather than zero: CodeMirror reads
      // this as `hoverTime || 300`, so a falsy value restores the default.
      { hoverTime: 1 },
    ),
  ]
}

/**
 * Marks every identifier that has a type. The marks are always here; the
 * stylesheet reveals them when the pointer is over the code, so nothing
 * advertises itself until you go looking.
 */
function marks(types: Types): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => build(state.doc, types),
    update: (value, transaction) =>
      transaction.docChanged ? build(transaction.state.doc, types) : value,
    provide: (field) => EditorView.decorations.from(field),
  })
}

const mark = Decoration.mark({ class: 'twoslash-mark' })

function build(doc: Parameters<typeof Identifier.at>[0], types: Types): DecorationSet {
  const ranges = []
  for (let line = 1; line <= doc.lines; line++) {
    const text = doc.line(line)
    for (const found of Identifier.all(text.text))
      if (types[found.name]) ranges.push(mark.range(text.from + found.from, text.from + found.to))
  }
  return Decoration.set(ranges, true)
}

/** The `^?` line under an identifier's line, whatever it points at. */
function caretBelow(view: EditorView, identifier: Identifier.Identifier) {
  const { doc } = view.state
  const line = doc.lineAt(identifier.from)
  if (line.number >= doc.lines) return undefined
  const below = doc.line(line.number + 1)
  return Identifier.caretColumn(below.text) === undefined ? undefined : below
}

/** Whether a caret line is already pointing at this identifier. */
function pinned(view: EditorView, identifier: Identifier.Identifier) {
  const below = caretBelow(view, identifier)
  const line = view.state.doc.lineAt(identifier.from)
  return below?.text === Identifier.caretLine(identifier.from - line.from) ? below : undefined
}

function toggle(view: EditorView, identifier: Identifier.Identifier) {
  const line = view.state.doc.lineAt(identifier.from)
  const wanted = Identifier.caretLine(identifier.from - line.from)
  const below = caretBelow(view, identifier)
  // A line carries one caret, so pinning a second identifier on it moves the
  // caret across rather than stacking one under the other.
  if (below)
    view.dispatch(
      below.text === wanted
        ? { changes: { from: line.to, to: below.to } }
        : { changes: { from: below.from, insert: wanted, to: below.to } },
    )
  else view.dispatch({ changes: { from: line.to, insert: `\n${wanted}` } })
}
