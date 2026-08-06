import { StateEffect, StateField } from '@codemirror/state'
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
  // The identifier the last single click toggled, so a second click of the
  // same gesture can put it back rather than leaving a pin behind.
  let last: Identifier.Identifier | undefined
  // Mirrors the field, so moving within the code does not dispatch on every
  // token the pointer crosses.
  let inside = false

  return [
    marks(types),
    hoverTooltip(
      (view, pos) => {
        const identifier = Identifier.at(view.state.doc, pos)
        const type = identifier && types[identifier.name]
        if (!identifier || !type) return null
        return {
          // Below the identifier, where pinning will leave it: hovering previews
          // the pinned block in place rather than somewhere else.
          above: false,
          create: () => ({ dom: Annotation.element(type) }),
          end: identifier.to,
          pos: identifier.from,
        }
      },
      // The types are already in hand, so waiting only makes the editor feel
      // slower than it is. One millisecond rather than zero: CodeMirror reads
      // this as `hoverTime || 300`, so a falsy value restores the default.
      { hoverTime: 1 },
    ),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        // A double click selects a word, so it undoes the pin its own first
        // click made rather than pinning on the way past.
        if (event.detail > 1) {
          if (last) toggle(view, last)
          last = undefined
          return false
        }
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        const identifier = pos === null ? undefined : Identifier.at(view.state.doc, pos)
        // Only identifiers that carry a type respond, so an ordinary click
        // somewhere else still just places the cursor.
        if (!identifier || !types[identifier.name]) {
          last = undefined
          return false
        }
        toggle(view, identifier)
        last = identifier
        return false
      },
      // `mouseover`/`mouseout` rather than enter and leave: only these bubble,
      // and CodeMirror delegates from the content element.
      mouseout(event, view) {
        const to = event.relatedTarget
        if (to instanceof Node && view.contentDOM.contains(to)) return false
        inside = false
        view.dispatch({ effects: setHovered.of(false) })
        return false
      },
      mouseover(_event, view) {
        if (inside) return false
        inside = true
        view.dispatch({ effects: setHovered.of(true) })
        return false
      },
    }),
  ]
}

/** Whether the pointer is over the editor, so the marks can come and go. */
const setHovered = StateEffect.define<boolean>()

/**
 * Underlines every identifier that has a type, while the pointer is over the
 * editor. Nothing advertises itself until you go looking, and then everything
 * worth hovering says so at once.
 */
function marks(types: Types): Extension {
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, transaction) {
      for (const effect of transaction.effects)
        if (effect.is(setHovered))
          return effect.value ? build(transaction.state.doc, types) : Decoration.none
      if (value === Decoration.none) return value
      return build(transaction.state.doc, types)
    },
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

/** The caret line below the identifier, when one is already pointing at it. */
function pinned(view: EditorView, identifier: Identifier.Identifier) {
  const { doc } = view.state
  const line = doc.lineAt(identifier.from)
  if (line.number >= doc.lines) return undefined
  const below = doc.line(line.number + 1)
  return below.text === Identifier.caretLine(identifier.from - line.from) ? below : undefined
}

function toggle(view: EditorView, identifier: Identifier.Identifier) {
  const line = view.state.doc.lineAt(identifier.from)
  const existing = pinned(view, identifier)
  view.dispatch(
    existing
      ? { changes: { from: line.to, to: existing.to } }
      : {
          changes: {
            from: line.to,
            insert: `\n${Identifier.caretLine(identifier.from - line.from)}`,
          },
        },
  )
}
