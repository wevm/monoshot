import type { EditorState, Extension } from '@codemirror/state'
import { completionStatus } from '@codemirror/autocomplete'
import { Decoration, EditorView, hoverTooltip, keymap } from '@codemirror/view'
import type { Rect } from '@codemirror/view'

import { Tooltip } from '#/ui/Tooltip.js'
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

/** Palette values that a body-portaled hover no longer inherits from the editor. */
const palette = [
  '--mark-add',
  '--mark-remove',
  '--window-background',
  '--window-border',
  '--window-foreground',
  '--window-surface',
] as const

const mark = Decoration.mark({ class: 'twoslash-mark' })

/**
 * Marks every span with a resolved type. Deriving marks from type spans keeps
 * underline and hover positions consistent. CSS reveals marks on editor hover.
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
 * beside it: it survives reloads and uses the existing export representation.
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
      // Prefer diagnostics over type information when both cover the token.
      const diagnostic = objection(view.state, identifier)
      // Already on screen, either as the block a pin left or as the type a
      // caret line asked for: a hover would only cover what it is about.
      if (diagnostic ? kept(view.state, diagnostic.from) : pinned(view, identifier)) return null
      const message = diagnostic && prose(diagnostic.message)
      const annotation = found.annotation
      /**
       * Returns the state represented by the current popover content.
       */
      const showing = (state: EditorState) => {
        const found = objection(state, identifier)
        return `${found?.message ?? ''}|${overlookedAt(state, identifier) ?? ''}`
      }
      /** Renders the current diagnostic or type annotation. */
      const draw = (state: EditorState) => {
        const found = objection(state, identifier)
        // Offer restoration when this span contains an ignored diagnostic.
        const waved = found ? undefined : overlookedAt(state, identifier)
        return Annotation.element(
          found ? prose(found.message) : annotation,
          found
            ? [
                { label: 'Pin this message', select: () => keep(view, found.from) },
                {
                  icon: Annotation.cross,
                  label: 'Ignore this message',
                  select: () => overlook(view, found.from),
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
      }
      return {
        // Below the identifier, where pinning will leave it, so hovering
        // previews the pinned block in place rather than somewhere else. It
        // goes above instead when that space is already showing a pinned
        // type, which a hover would otherwise sit on top of. CodeMirror
        // flips it back if there is no room up there.
        above: covered(view, identifier, (message ?? found.annotation).length),
        create: () => {
          let word: Rect | null = null
          let shape = showing(view.state)
          let surface = draw(view.state)
          const root = bridge(surface)
          const frame = view.dom.closest<HTMLElement>('[data-frame-window]')
          if (frame) {
            root.style.setProperty('--twoslash-hover-max-width', `${frame.clientWidth - reach}px`)
            const theme = getComputedStyle(view.dom)
            root.style.color = theme.color
            for (const property of palette)
              root.style.setProperty(property, theme.getPropertyValue(property))
          }
          /**
           * Aligns the notch with the identifier after viewport-constrained placement.
           */
          const point = () => {
            if (!word) return
            const box = surface.getBoundingClientRect()
            const limit = Math.max(inset, box.width - inset - notch)
            const left = Math.min(Math.max(word.left - box.left, inset), limit)
            surface.style.setProperty('--twoslash-notch', `${left}px`)
          }
          return {
            dom: root,
            // Measure the identifier through CodeMirror's tooltip lifecycle.
            getCoords(anchor) {
              word = view.coordsAtPos(anchor)
              // CodeMirror hides a tooltip whose anchor it cannot measure, and
              // its default also returns null; only the declared type excludes
              // hook's declared type leaves the case out.
              return word as Rect
            },
            // Include the notch inset and bridge width while preserving the
            // visible surface position.
            offset: { x: -inset - reach, y: 0 },
            positioned: point,
            update(update) {
              const next = showing(update.state)
              if (next === shape) return
              shape = next
              surface = draw(update.state)
              // Dismiss tooltip state before replacing its interactive controls.
              Tooltip.point()
              root.replaceChildren(surface)
              point()
            },
          }
        },
        end: identifier.to,
        pos: identifier.from,
      }
    },
    {
      // Close the hover when pinning inserts the corresponding inline type block.
      hideOnChange: true,
      // Match the opening delay used by control tooltips.
      hoverTime: 100,
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
  // A pinned diagnostic occupies the space below its source line.
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

/** Returns the `^?` line immediately below an identifier. */
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
