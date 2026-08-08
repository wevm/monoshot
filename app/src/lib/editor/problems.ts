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
  return setDiagnostics(
    state,
    diagnostics
      .filter((diagnostic) => diagnostic.from < end)
      .map((diagnostic) => ({
        from: Math.max(0, Math.min(diagnostic.from, end)),
        message: diagnostic.text,
        severity: severity[diagnostic.level],
        // At least one character wide, so a zero-length range still shows.
        to: Math.min(Math.max(diagnostic.to, diagnostic.from + 1), end),
      })),
  )
}

/** The compiler's levels in the editor's vocabulary. */
const severity = {
  error: 'error',
  message: 'info',
  suggestion: 'hint',
  warning: 'warning',
} as const satisfies Record<Twoslash.Diagnostic['level'], string>
