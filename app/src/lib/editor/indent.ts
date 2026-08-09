import { indentService, indentUnit, indentRange } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** Two spaces, matching the tab size the frame and the editor share. */
const unit = '  '

/**
 * Indentation for an editor with no grammar.
 *
 * The code is colored from shiki tokens rather than parsed, so there is no
 * syntax tree to ask where a line belongs. This reads the shape instead: carry
 * the previous line's indentation, one level deeper after a line that opens a
 * block and one shallower on a line that closes one. That is what a plain
 * editor does, and it holds for every language the picker offers rather than
 * the few a parser would cover.
 *
 * It only ever adds a level. Leaving one is the editor's own outdent, since
 * nothing here knows where a Python block ends.
 */
export const indent: Extension = [
  indentUnit.of(unit),
  // A closer typed onto a line of its own is the one case the service cannot
  // reach on its own: nothing dispatches an indent for ordinary input, so the
  // delimiter would sit at whatever depth the line already had.
  EditorView.inputHandler.of((view, from, to, text) => {
    if (!/^[)\]}]$/.test(text)) return false
    const line = view.state.doc.lineAt(from)
    // Only when it opens the line. Mid-line the caret is inside an expression,
    // where the indentation is already whatever the author chose.
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
    // The context's own `lineAt`, never the document's: pressing Enter asks
    // for this before the break exists, and only the context knows where it
    // is about to fall. Biased backwards, so it is the line being left.
    const start = context.lineAt(pos, -1)
    // An empty line lying exactly on the caret is how a break on both sides
    // of it shows up, which is Enter pressed between a pair. The closer is
    // moving to a line of its own, and gets indented separately, so it must
    // not pull this line back out of the level its opener just added.
    const between = start.from === pos && start.text === ''

    // Only what lies before this position, never the whole line: reindenting
    // one asks from its start, where the line's own text is still ahead and
    // says nothing about the depth it belongs at.
    let text = start.text.slice(0, Math.max(0, pos - start.from))
    let from = start.from
    // A blank run says nothing about depth either, so walk back to a line that
    // does.
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
