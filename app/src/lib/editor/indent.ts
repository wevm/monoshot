import { indentService, indentUnit } from '@codemirror/language'
import type { Extension } from '@codemirror/state'

/** Two spaces, matching the tab size the frame and the editor share. */
const unit = '  '

/**
 * Indentation for an editor with no grammar.
 *
 * The code is colored from shiki tokens rather than parsed, so there is no
 * syntax tree to ask where a line belongs. This reads the shape instead: carry
 * the previous line's indentation, one level deeper after a line that opens a
 * bracket and one shallower on a line that closes one. That is what a plain
 * editor does, and it holds for every language the picker offers rather than
 * the few a parser would cover.
 */
export const indent: Extension = [
  indentUnit.of(unit),
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

    let line = start
    // A blank line says nothing about depth, so walk back to one that does.
    while (line.text.trim() === '' && line.from > 0) line = context.lineAt(line.from - 1, -1)
    if (line.text.trim() === '') return 0

    const indentation = /^\s*/.exec(line.text)?.[0].length ?? 0
    const opens = /[([{]\s*$/.test(line.text)
    // A closer already sitting at the caret belongs one level out, which is
    // what puts `}` under its opener when a pair is split across lines.
    const closes = !between && /^\s*[)\]}]/.test(context.state.doc.sliceString(pos, pos + 2))
    return Math.max(0, indentation + (opens ? unit.length : 0) - (closes ? unit.length : 0))
  }),
]
