import { StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip, keymap } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

import * as Annotation from './annotation.js'
import * as Identifier from './identifier.js'

/**
 * How far the hover reaches past its own left edge. CodeMirror keeps a hover
 * open while the pointer is inside the tooltip's bounding box, so the pin
 * hanging outside the surface only stays reachable if the tooltip is this much
 * wider than what it draws.
 */
const reach = 30

/** Types by identifier name, tokenized so they paint like the code. */
export type Types = Record<string, Annotation.Annotation>

/**
 * The type registered for an identifier. Own properties only, so a variable
 * named `constructor` or `toString` finds nothing rather than inheriting one.
 */
export function type(types: Types, name: string): Annotation.Annotation | undefined {
  return Object.hasOwn(types, name) ? types[name] : undefined
}

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
        const found = identifier && type(types, identifier.name)
        if (!identifier || !found) return null
        // A pinned type is already on screen, so hovering it would only cover
        // the block it is asking about.
        if (pinned(view, identifier)) return null
        return {
          // Below the identifier, where pinning will leave it, so hovering
          // previews the pinned block in place rather than somewhere else. It
          // goes above instead when that space is already showing a pinned
          // type, which a hover would otherwise sit on top of. CodeMirror
          // flips it back if there is no room up there.
          above: covered(view, identifier, found.length),
          // Offset belongs on the view, not the spec: CodeMirror reads it off
          // what `create` returns. Back by the notch's own inset, so the notch
          // lands on the token rather than a few characters into it. The drop
          // below the word is the bridge's, not the offset's: CodeMirror hides
          // the hover as soon as the pointer leaves both the word and the
          // tooltip, so an offset gap is a moat you cannot cross.
          create: () => ({
            dom: bridge(
              Annotation.element(found, {
                label: 'Pin this type',
                select: () => toggle(view, identifier),
              }),
            ),
            // Back by the reach as well, so widening the tooltip leftwards
            // leaves the surface itself where it was.
            offset: { x: -8 - reach, y: 0 },
          }),
          end: identifier.to,
          pos: identifier.from,
        }
      },
      {
        // Pinning writes the caret line, and the type it puts in flow is the
        // one the hover is showing: without this the hover outlives the edit
        // and sits on top of the block it just made.
        hideOnChange: true,
        // The types are already in hand, so waiting only makes the editor feel
        // slower than it is. One millisecond rather than zero: CodeMirror reads
        // this as `hoverTime || 300`, so a falsy value restores the default.
        hoverTime: 1,
      },
    ),
    // The pin is a pointer affordance on a surface only a pointer opens, so
    // the caret gets its own way in.
    keymap.of([
      {
        key: 'Mod-i',
        run(view) {
          const identifier = Identifier.at(view.state.doc, view.state.selection.main.head)
          if (!identifier || !type(types, identifier.name)) return false
          toggle(view, identifier)
          return true
        },
      },
    ]),
  ]
}

/**
 * Whether a pinned type sits in the space a popover of `lines` would open
 * into. Counted in document lines rather than measured: a type is about as
 * tall as the code it covers, and one line either way only decides a side.
 */
function covered(view: EditorView, identifier: Identifier.Identifier, lines: number) {
  const { doc } = view.state
  const start = doc.lineAt(identifier.from).number
  const end = Math.min(doc.lines, start + lines + 1)
  for (let line = start + 1; line <= end; line++)
    if (Identifier.caretColumn(doc.line(line).text) !== undefined) return true
  return false
}

/** Wraps a surface in the transparent run that carries the pointer out to it. */
function bridge(surface: HTMLElement): HTMLElement {
  const root = document.createElement('div')
  root.className = 'twoslash-bridge'
  root.style.setProperty('--twoslash-reach', `${reach}px`)
  root.appendChild(surface)
  return root
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
      if (type(types, found.name))
        ranges.push(mark.range(text.from + found.from, text.from + found.to))
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
