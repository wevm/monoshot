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

/** Toggles a pinned diagnostic at the specified offset. */
export function keep(view: EditorView, at: number): void {
  view.dispatch({ effects: pin.of(at) })
}

/**
 * Toggles an ignored diagnostic in the editor and exported output.
 * This supports snippets whose omitted context produces irrelevant diagnostics.
 */
export function overlook(view: EditorView, at: number): void {
  view.dispatch({ effects: dismiss.of(at) })
}

/** Offsets of ignored diagnostics. */
export function overlooked(state: EditorState): readonly number[] {
  return state.field(field, false)?.ignored ?? []
}

/**
 * Returns the ignored diagnostic offset within a span, when present.
 */
export function overlookedAt(
  state: EditorState,
  span: { from: number; to: number },
): number | undefined {
  return overlooked(state).find((at) => at >= span.from && at <= span.to)
}

/** Whether a diagnostic covering an offset is pinned. */
export function kept(state: EditorState, at: number): boolean {
  return state.field(field, false)?.pinned.some((offset) => offset === at) ?? false
}

/** Returns the source offset of a diagnostic pinned below a line. */
export function keptUnder(state: EditorState, line: number): number | undefined {
  const pinned = state.field(field, false)?.pinned ?? []
  return pinned.find((at) => at <= state.doc.length && state.doc.lineAt(at).number === line)
}

/** Toggles the pinned diagnostic at an offset. */
const pin = StateEffect.define<number>()

/** Toggles whether a diagnostic is ignored. */
const dismiss = StateEffect.define<number>()

const field = StateField.define<Value>({
  create: () => ({ decorations: Decoration.none, ignored: [], pinned: [] }),
  update(value, transaction) {
    // Map offsets only after document changes to prevent redundant transactions.
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
    // Rebuild because diagnostics reside in CodeMirror's private lint state.
    return { decorations: build(transaction.state, pinned), ignored, pinned }
  },
  provide: (self) => EditorView.decorations.from(self, (value) => value.decorations),
})

/**
 * Pins diagnostics below their source lines to match exported frame output.
 * Pin state remains separate from document content.
 */
export const pins: Extension = field

type Value = {
  decorations: DecorationSet
  /** Offsets of ignored diagnostics. */
  ignored: readonly number[]
  /** Diagnostic pin offsets in insertion order. */
  pinned: readonly number[]
}

function build(state: EditorState, pinned: readonly number[]): DecorationSet {
  if (!pinned.length) return Decoration.none
  const ranges: Range<Decoration>[] = []
  const drawn = new Set<number>()
  forEachDiagnostic(state, (diagnostic, from, to) => {
    // A mapped pin can move within a diagnostic span. Use an exclusive end so
    // boundary pins belong to the following diagnostic.
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
 * Renders compiler diagnostics as editor squiggles.
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
  // An empty document has no character that can carry a diagnostic mark.
  if (end === 0) return setDiagnostics(state, [])
  const ignored = overlooked(state)
  return setDiagnostics(
    state,
    diagnostics
      .filter((diagnostic) => !ignored.some((at) => at >= diagnostic.from && at <= diagnostic.to))
      .map((diagnostic) => {
        // At least one character wide, so a zero-length range still shows. An
        // unfinished snippet puts its diagnostic at the end, past the last
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
