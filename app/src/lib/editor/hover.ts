import type { Extension } from '@codemirror/state'
import { EditorView, hoverTooltip } from '@codemirror/view'

import * as Identifier from './identifier.js'

/**
 * Shows an identifier's type on hover, and pins it on click. Pinning writes the
 * `^?` line twoslash reads, so a pin is part of the snippet rather than state
 * beside it: it survives a reload, and the export already knows how to draw it.
 */
export function hover(types: Record<string, string>): Extension {
  return hoverTooltip((view, pos) => {
    const identifier = Identifier.at(view.state.doc, pos)
    const type = identifier && types[identifier.name]
    if (!identifier || !type) return null
    return {
      above: true,
      create: () => ({ dom: popover(view, identifier, type) }),
      end: identifier.to,
      pos: identifier.from,
    }
  })
}

function popover(view: EditorView, identifier: Identifier.Identifier, type: string) {
  const root = document.createElement('button')
  root.className = 'twoslash-hover'
  root.type = 'button'
  root.title = 'Pin this type'

  const body = document.createElement('span')
  body.textContent = type
  root.appendChild(body)

  const hint = document.createElement('span')
  hint.className = 'twoslash-hover-hint'
  hint.textContent = pinned(view, identifier) ? 'Click to unpin' : 'Click to pin'
  root.appendChild(hint)

  root.addEventListener('click', () => toggle(view, identifier))
  return root
}

/** Whether the line below the identifier is already a caret pointing at it. */
function pinned(view: EditorView, identifier: Identifier.Identifier) {
  const { doc } = view.state
  const line = doc.lineAt(identifier.from)
  if (line.number >= doc.lines) return undefined
  const below = doc.line(line.number + 1)
  return below.text === Identifier.caretLine(identifier.from - line.from) ? below : undefined
}

function toggle(view: EditorView, identifier: Identifier.Identifier) {
  const { doc } = view.state
  const line = doc.lineAt(identifier.from)
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
