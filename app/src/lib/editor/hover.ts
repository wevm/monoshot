import type { Extension } from '@codemirror/state'
import { completionStatus } from '@codemirror/autocomplete'
import { Decoration, EditorView, hoverTooltip, keymap } from '@codemirror/view'
import type { Rect } from '@codemirror/view'

import * as Annotation from './annotation.js'
import * as Identifier from './identifier.js'
import { keep, kept, keptUnder, objection, overlook, overlookedAt } from './problems.js'
import * as Types from './types.js'

/**
 * How far the hover reaches past its own left edge. CodeMirror keeps a hover
 * open while the pointer is inside the tooltip's bounding box, so a control
 * hanging outside the surface only stays reachable if the tooltip is this much
 * wider than what it draws: two of them a line tall, the gap and the margin
 * between, and a little to spare.
 */
const reach = 54

/** How far the notch sits inside the surface's leading edge. */
const inset = 8

/** The notch's own side, before it is turned onto its corner. */
const notch = 7

const mark = Decoration.mark({ class: 'twoslash-mark' })

/**
 * Marks every span a type is known for. Derived from the types rather than
 * mapped alongside them, so the underline and the hover can never disagree
 * about where a type belongs. The marks are always here; the stylesheet reveals
 * them when the pointer is over the code, so nothing advertises itself until
 * you go looking.
 */
const marks = EditorView.decorations.compute([Types.types], (state) =>
  Decoration.set(
    state
      .field(Types.types)
      .filter((span) => span.to > span.from)
      .map((span) => mark.range(span.from, span.to)),
    true,
  ),
)

/**
 * Shows an identifier's type on hover, and pins it on click. Pinning writes the
 * `^?` line twoslash reads, so a pin is part of the snippet rather than state
 * beside it: it survives a reload, and the export already knows how to draw it.
 */
export const hover: Extension = [
  Types.types,
  marks,
  hoverTooltip(
    (view, pos) => {
      // One popover at a time: the completion menu is what the caret is
      // working with, and a type hovering over it would cover the list.
      if (completionStatus(view.state) !== null) return null
      const found = Types.at(view.state, pos)
      const identifier = found && { from: found.from, to: found.to }
      if (!identifier || !found) return null
      // What is wrong with a token outranks what type it holds, and it is read
      // on the same surface: one popover, whichever it is showing.
      const complaint = objection(view.state, identifier)
      // Already on screen, either as the block a pin left or as the type a
      // caret line asked for: a hover would only cover what it is about.
      if (complaint ? kept(view.state, complaint.from) : pinned(view, identifier)) return null
      const message = complaint && prose(complaint.message)
      // A complaint waved off is no longer reported, so the only thing left
      // saying it was ever there is the offer to hear it again.
      const waved = complaint ? undefined : overlookedAt(view.state, identifier)
      return {
        // Below the identifier, where pinning will leave it, so hovering
        // previews the pinned block in place rather than somewhere else. It
        // goes above instead when that space is already showing a pinned
        // type, which a hover would otherwise sit on top of. CodeMirror
        // flips it back if there is no room up there.
        above: covered(view, identifier, (message ?? found.annotation).length),
        create: () => {
          const surface = Annotation.element(
            message ?? found.annotation,
            complaint
              ? [
                  { label: 'Pin this message', select: () => keep(view, complaint.from) },
                  {
                    icon: Annotation.cross,
                    label: 'Ignore this message',
                    select: () => overlook(view, complaint.from),
                  },
                ]
              : [
                  { label: 'Pin this type', select: () => toggle(view, identifier) },
                  ...(waved === undefined
                    ? []
                    : [
                        {
                          icon: Annotation.back,
                          label: 'Report this message again',
                          select: () => overlook(view, waved),
                        },
                      ]),
                ],
          )
          let word: Rect | null = null
          return {
            dom: bridge(surface),
            // The measure phase is the one place a tooltip may ask CodeMirror
            // where a position sits, so the word is taken here and read back
            // once the surface has been placed.
            getCoords(anchor) {
              word = view.coordsAtPos(anchor)
              // CodeMirror hides a tooltip whose anchor it cannot measure, and
              // its own default returns the same nothing this does; only the
              // hook's declared type leaves the case out.
              return word as Rect
            },
            // Offset belongs on the view, not the spec: CodeMirror reads it off
            // what `create` returns. Back by the notch's own inset, so the notch
            // lands on the token rather than a few characters into it. The drop
            // below the word is the bridge's, not the offset's: CodeMirror hides
            // the hover as soon as the pointer leaves both the word and the
            // tooltip, so an offset gap is a moat you cannot cross.
            //
            // Back by the reach as well, so widening the tooltip leftwards
            // leaves the surface itself where it was.
            offset: { x: -inset - reach, y: 0 },
            // Runs after placement, which is the only point at which where the
            // surface actually landed is known: a tooltip wider than the room
            // to its right is clamped into the viewport, and a notch pinned at
            // a fixed inset would then point somewhere left of its word.
            positioned() {
              if (!word) return
              const box = surface.getBoundingClientRect()
              const limit = Math.max(inset, box.width - inset - notch)
              const left = Math.min(Math.max(word.left - box.left, inset), limit)
              surface.style.setProperty('--twoslash-notch', `${left}px`)
            },
          }
        },
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
        const found = Types.at(view.state, view.state.selection.main.head)
        if (!found) return false
        toggle(view, found)
        return true
      },
    },
  ]),
]

/**
 * A message on the surface a type is drawn on, so the compiler's prose and the
 * language service's types read as one popover rather than two designs.
 */
function prose(message: string): Annotation.Annotation {
  return [[{ content: message, offset: 0 }]]
}

/**
 * Whether something already sits in the space a popover of `lines` would open
 * into. Counted in document lines rather than measured: a type is about as
 * tall as the code it covers, and one line either way only decides a side.
 */
function covered(view: EditorView, identifier: { from: number }, lines: number) {
  const { doc } = view.state
  const start = doc.lineAt(identifier.from).number
  // A complaint kept on screen draws directly under its line, which is exactly
  // the space a popover would open into.
  if (keptUnder(view.state, start) !== undefined) return true
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

/** The `^?` line under an identifier's line, whatever it points at. */
function caretBelow(view: EditorView, identifier: { from: number }) {
  const { doc } = view.state
  const line = doc.lineAt(identifier.from)
  if (line.number >= doc.lines) return undefined
  const below = doc.line(line.number + 1)
  return Identifier.caretColumn(below.text) === undefined ? undefined : below
}

/** Whether a caret line is already pointing at this identifier. */
function pinned(view: EditorView, identifier: { from: number }) {
  const below = caretBelow(view, identifier)
  const line = view.state.doc.lineAt(identifier.from)
  return below?.text === Identifier.caretLine(identifier.from - line.from) ? below : undefined
}

function toggle(view: EditorView, identifier: { from: number }) {
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
