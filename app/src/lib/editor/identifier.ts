import type { Text } from '@codemirror/state'

/** An identifier found in the document, with the span it occupies. */
export type Identifier = {
  from: number
  name: string
  to: number
}

const word = /[A-Za-z_$][\w$]*/g

/**
 * The identifier covering a document position, if any. A regex rather than a
 * syntax tree: the editor colors from shiki tokens and carries no grammar.
 */
export function at(doc: Text, pos: number): Identifier | undefined {
  const line = doc.lineAt(pos)
  const column = pos - line.from
  word.lastIndex = 0
  for (let match = word.exec(line.text); match; match = word.exec(line.text)) {
    const start = match.index
    const end = start + match[0].length
    if (column < start) return undefined
    if (column <= end) return { from: line.from + start, name: match[0], to: line.from + end }
  }
  return undefined
}

/** Every identifier in a line, as offsets within that line. */
export function* all(text: string): Generator<{ from: number; name: string; to: number }> {
  word.lastIndex = 0
  for (let match = word.exec(text); match; match = word.exec(text))
    yield { from: match.index, name: match[0], to: match.index + match[0].length }
}

/**
 * The line a `^?` caret in `line` points at, and the identifier under it. The
 * caret addresses the line above, which is where twoslash reads it from.
 */
export function queried(doc: Text, line: number, column: number): Identifier | undefined {
  if (line <= 1) return undefined
  const above = doc.line(line - 1)
  if (column > above.length) return undefined
  return at(doc, above.from + column)
}

/**
 * A `// ^?` line whose caret sits at `column`. Two characters go to the comment
 * itself, so a caret nearer the start than that lands as close as it can.
 */
export function caretLine(column: number): string {
  const lead = Math.max(0, column - 3)
  const gap = Math.max(1, column - lead - 2)
  return `${' '.repeat(lead)}//${' '.repeat(gap)}^?`
}
