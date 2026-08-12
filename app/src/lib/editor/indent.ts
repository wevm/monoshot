import { indentService, indentUnit, indentRange } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** Two spaces, matching the tab size the frame and the editor share. */
const unit = '  '

/**
 * Indentation for an editor with no grammar.
 *
 * The code is colored from shiki tokens rather than parsed, so there is no
 * syntax tree for indentation. This implementation preserves the previous line's
 * indentation, adds one level after an opener, and removes one after a closer.
 *
 * It only ever adds a level. Leaving one is the editor's own outdent, since
 * this heuristic cannot determine where indentation-delimited blocks end.
 */
export const indent: Extension = [
  indentUnit.of(unit),
  // A closer typed onto a line of its own is the one case the service cannot
  // handle automatically because ordinary input does not trigger reindentation.
  EditorView.inputHandler.of((view, from, to, text) => {
    if (!/^[)\]}]$/.test(text)) return false
    const line = view.state.doc.lineAt(from)
    // Only when it opens the line. Mid-line the caret is inside an expression,
    // where existing indentation should remain unchanged.
    if (line.text.slice(0, from - line.from).trim() !== '') return false
    view.dispatch({
      changes: { from, insert: text, to },
      selection: { anchor: from + text.length },
      userEvent: 'input.type',
    })
    // Against the document the closer is now in, so the service sees it and
    // pulls the line out a level.
    const placed = view.state.doc.lineAt(view.state.selection.main.head)
    view.dispatch({ changes: indentRange(view.state, placed.from, placed.from) })
    return true
  }),
  indentService.of((context, pos) => {
    // Use the context's `lineAt` because Enter requests indentation before the
    // break exists. Bias backward to read the preceding line.
    const start = context.lineAt(pos, -1)
    // An empty line lying exactly on the caret is how a break on both sides
    // of it shows up, which is Enter pressed between a pair. The closer is
    // moving to a line of its own, and gets indented separately, so it must
    // not pull this line back out of the level its opener just added.
    const between = start.from === pos && start.text === ''

    // Only what lies before this position, never the whole line: reindenting
    // a line requests indentation from its start, before its text is included.
    let text = start.text.slice(0, Math.max(0, pos - start.from))
    let from = start.from
    // Walk backward across blank lines to find indentation context.
    while (text.trim() === '' && from > 0) {
      const previous = context.lineAt(from - 1, -1)
      text = previous.text
      from = previous.from
    }
    if (text.trim() === '') return 0

    // Counted in columns rather than characters: a shared snippet can be
    // indented with tabs, and one tab is several columns wide.
    const indentation = context.lineIndent(from, -1)
    // A trailing colon opens a block in Python, YAML, and the rest of the
    // indentation-delimited languages the picker offers, and it is what a
    // `case` or a label opens in a bracketed one.
    const opens = /[([{:]\s*$/.test(text)
    // A closer ahead of this position belongs one level out, which is what
    // puts `}` under its opener. Whitespace may precede it, since the line
    // being reindented already carries its own, but not a newline: a closer on
    // the next line is that line's business.
    const ahead = context.state.doc.sliceString(pos, Math.min(pos + 40, context.state.doc.length))
    const closes = !between && /^[^\S\n]*[)\]}]/.test(ahead)
    return Math.max(0, indentation + (opens ? unit.length : 0) - (closes ? unit.length : 0))
  }),
]
