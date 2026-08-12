import { forEachDiagnostic, setDiagnostics } from '@codemirror/lint'
import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension, Range, TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import type { Twoslash } from 'monoshot'

/**
 * Whether the compiler objects to anything a span covers.
 *
 * A marked span carries its own hover, and the two would otherwise stack into
 * one popover: what is wrong with a token outranks what type it holds.
 */
export function objection(
  state: EditorState,
  span: { from: number; to: number },
): { from: number; message: string; to: number } | undefined {
  let found: { from: number; message: string; to: number } | undefined
  // Overlap rather than touch: a diagnostic ending where the span starts sits
  // beside it rather than on it.
  forEachDiagnostic(state, (diagnostic, from, to) => {
    if (found || from >= span.to || span.from >= to) return
    found = { from, message: diagnostic.message, to }
  })
  return found
}

/** Keeps a complaint on screen, or takes back the one kept at that offset. */
export function keep(view: EditorView, at: number): void {
  view.dispatch({ effects: pin.of(at) })
}

/**
 * Takes a complaint out of what is reported, in the editor and in what it
 * exports: a snippet is a fragment, and the compiler objecting to what was left
 * outside it says nothing about the code being shown.
 */
export function overlook(view: EditorView, at: number): void {
  view.dispatch({ effects: dismiss.of(at) })
}

/** Offsets whose complaint is not reported. */
export function overlooked(state: EditorState): readonly number[] {
  return state.field(field, false)?.ignored ?? []
}

/**
 * Where a complaint a span carries was waved off, if one was. The complaint is
 * no longer reported, so nothing else on the span says it is there.
 */
export function overlookedAt(
  state: EditorState,
  span: { from: number; to: number },
): number | undefined {
  return overlooked(state).find((at) => at >= span.from && at <= span.to)
}

/** Whether a complaint covering an offset is already on screen. */
export function kept(state: EditorState, at: number): boolean {
  return state.field(field, false)?.pinned.some((offset) => offset === at) ?? false
}

/** Where a complaint kept on screen under a line was taken from, if there is one. */
export function keptUnder(state: EditorState, line: number): number | undefined {
  const pinned = state.field(field, false)?.pinned ?? []
  return pinned.find((at) => at <= state.doc.length && state.doc.lineAt(at).number === line)
}

/** Pins a complaint in place, or takes back the pin at that offset. */
const pin = StateEffect.define<number>()

/** Takes a complaint out of what is reported, or reports it again. */
const dismiss = StateEffect.define<number>()

const field = StateField.define<Value>({
  create: () => ({ decorations: Decoration.none, ignored: [], pinned: [] }),
  update(value, transaction) {
    // Mapped only when the document moved: a fresh array every transaction
    // reads as a change to whatever is watching this, and answering that with
    // another transaction never ends.
    let pinned = transaction.docChanged
      ? value.pinned.map((at) => transaction.changes.mapPos(at))
      : value.pinned
    let ignored = transaction.docChanged
      ? value.ignored.map((at) => transaction.changes.mapPos(at))
      : value.ignored
    for (const effect of transaction.effects) {
      if (effect.is(dismiss))
        ignored = ignored.includes(effect.value)
          ? ignored.filter((at) => at !== effect.value)
          : [...ignored, effect.value]
      if (effect.is(pin))
        pinned = pinned.includes(effect.value)
          ? pinned.filter((at) => at !== effect.value)
          : [...pinned, effect.value]
    }
    // Rebuilt every time rather than on a dependency: the complaints live in
    // the lint state, which is not a field this one can name.
    return { decorations: build(transaction.state, pinned), ignored, pinned }
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
  /** Offsets a complaint was taken out of what is reported at. */
  ignored: readonly number[]
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
    // Exclusive at the end: a pin sitting where one complaint stops belongs to
    // the one that starts there.
    if (!pinned.some((at) => at >= from && at < Math.max(to, from + 1))) return
    const line = state.doc.lineAt(from)
    if (drawn.has(line.number)) return
    drawn.add(line.number)
    ranges.push(
      Decoration.widget({
        block: true,
        side: 1,
        widget: new Objection(diagnostic.message),
      }).range(line.to),
    )
  })
  return Decoration.set(ranges, true)
}

class Objection extends WidgetType {
  constructor(readonly message: string) {
    super()
  }

  override eq(other: Objection) {
    return other.message === this.message
  }

  override toDOM() {
    const root = document.createElement('div')
    root.className = 'cm-objection'
    const text = document.createElement('span')
    text.textContent = this.message
    root.appendChild(text)
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
  const ignored = overlooked(state)
  return setDiagnostics(
    state,
    diagnostics
      .filter((diagnostic) => !ignored.some((at) => at >= diagnostic.from && at <= diagnostic.to))
      .map((diagnostic) => {
        // At least one character wide, so a zero-length range still shows. An
        // unfinished snippet puts its complaint at the very end, past the last
        // character, and that marker takes the character before it rather than
        // being dropped for having nowhere to sit.
        const to = Math.min(Math.max(diagnostic.to, diagnostic.from + 1), end)
        return {
          from: Math.max(0, Math.min(diagnostic.from, to - 1)),
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
