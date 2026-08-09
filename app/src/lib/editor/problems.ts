import { setDiagnostics } from '@codemirror/lint'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import type * as Twoslash from 'monoshot/twoslash'

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
