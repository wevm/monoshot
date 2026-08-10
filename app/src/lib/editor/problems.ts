import { forEachDiagnostic, setDiagnostics } from '@codemirror/lint'
import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension, Range, TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import type * as Twoslash from 'monoshot/twoslash'

import * as Annotation from './annotation.js'

/**
 * Whether the compiler objects to anything a span covers.
 *
 * A marked span carries its own hover, and the two would otherwise stack into
 * one popover: what is wrong with a token outranks what type it holds.
 */
export function objection(state: EditorState, span: { from: number; to: number }): boolean {
  let found = false
  // Overlap rather than touch: a diagnostic ending where the span starts sits
  // beside it rather than on it.
  forEachDiagnostic(state, (_, from, to) => {
    if (from < span.to && span.from < to) found = true
  })
  return found
}

/** Pins a complaint in place, or takes back the pin at that offset. */
const pin = StateEffect.define<number>()

const field = StateField.define<Value>({
  create: () => ({ decorations: Decoration.none, pinned: [] }),
  update(value, transaction) {
    let pinned = value.pinned.map((at) => transaction.changes.mapPos(at))
    for (const effect of transaction.effects)
      if (effect.is(pin))
        pinned = pinned.includes(effect.value)
          ? pinned.filter((at) => at !== effect.value)
          : [...pinned, effect.value]
    // Rebuilt every time rather than on a dependency: the complaints live in
    // the lint state, which is not a field this one can name.
    return { decorations: build(transaction.state, pinned), pinned }
  },
  provide: (self) => EditorView.decorations.from(self, (value) => value.decorations),
})

/**
 * Keeps a complaint on screen under the line it is about, the way the exported
 * frame draws every one of them. State beside the snippet rather than in it: the
 * export needs nothing written down to know an error is there.
 */
export const pins: Extension = field

type Value = {
  decorations: DecorationSet
  /** Offsets a complaint was pinned at, in the order they were pinned. */
  pinned: readonly number[]
}

function build(state: EditorState, pinned: readonly number[]): DecorationSet {
  if (!pinned.length) return Decoration.none
  const ranges: Range<Decoration>[] = []
  const drawn = new Set<number>()
  forEachDiagnostic(state, (diagnostic, from, to) => {
    // The offset the pin was taken at can have moved into the middle of the
    // complaint's span, and a complaint can cover more than one pin.
    if (!pinned.some((at) => at >= from && at <= to)) return
    const line = state.doc.lineAt(from)
    if (drawn.has(line.number)) return
    drawn.add(line.number)
    ranges.push(
      Decoration.widget({
        block: true,
        side: 1,
        widget: new Objection(diagnostic.message, from),
      }).range(line.to),
    )
  })
  return Decoration.set(ranges, true)
}

class Objection extends WidgetType {
  constructor(
    readonly message: string,
    readonly at: number,
  ) {
    super()
  }

  override eq(other: Objection) {
    return other.message === this.message
  }

  override toDOM(view: EditorView) {
    const root = document.createElement('div')
    root.className = 'cm-objection'
    const text = document.createElement('span')
    text.textContent = this.message
    root.appendChild(text)
    root.appendChild(
      Annotation.control({
        label: 'Unpin this message',
        select: () => view.dispatch({ effects: pin.of(this.at) }),
      }),
    )
    return root
  }
}

/**
 * Carries the compiler's complaints into the editor as squiggles.
 *
 * Ranges are clamped to the document: a diagnostic is resolved against the
 * text the worker last saw, which an edit since can have made shorter, and a
 * range past the end throws rather than drawing.
 */
export function problems(
  state: EditorState,
  diagnostics: readonly Twoslash.Diagnostic[],
): TransactionSpec {
  const end = state.doc.length
  // An empty document has no character to mark, so there is nothing to draw on.
  if (end === 0) return setDiagnostics(state, [])
  return setDiagnostics(
    state,
    diagnostics.map((diagnostic) => {
      // At least one character wide, so a zero-length range still shows. An
      // unfinished snippet puts its complaint at the very end, past the last
      // character, and that marker takes the character before it rather than
      // being dropped for having nowhere to sit.
      const to = Math.min(Math.max(diagnostic.to, diagnostic.from + 1), end)
      const from = Math.max(0, Math.min(diagnostic.from, to - 1))
      return {
        // The hover is where a complaint is read, so it is also where it is
        // kept: an exported frame draws every one, and this says which are on
        // screen while the snippet is being written.
        actions: [{ apply: (view) => view.dispatch({ effects: pin.of(from) }), name: 'Pin' }],
        from,
        message: diagnostic.text,
        severity: severity[diagnostic.level],
        to,
      }
    }),
  )
}

/** The compiler's levels in the editor's vocabulary. */
const severity = {
  error: 'error',
  message: 'info',
  suggestion: 'hint',
  warning: 'warning',
} as const satisfies Record<Twoslash.Diagnostic['level'], string>
