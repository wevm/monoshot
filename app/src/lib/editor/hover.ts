import type { Extension } from '@codemirror/state'
import { EditorView, hoverTooltip } from '@codemirror/view'

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
      // slower than it is.
      { hoverTime: 0 },
    ),
    EditorView.domEventHandlers({
      click(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        const identifier = pos === null ? undefined : Identifier.at(view.state.doc, pos)
        // Only identifiers that carry a type respond, so an ordinary click
        // somewhere else still just places the cursor.
        if (!identifier || !types[identifier.name]) return false
        toggle(view, identifier)
        return false
      },
    }),
  ]
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
