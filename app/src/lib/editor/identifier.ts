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
  const found = atColumn(line.text, pos - line.from)
  return found && { from: line.from + found.from, name: found.name, to: line.from + found.to }
}

/** The identifier covering a column of a line, as offsets within it. */
function atColumn(text: string, column: number): Identifier | undefined {
  for (const found of all(text)) {
    if (column < found.from) return undefined
    if (column <= found.to) return found
  }
  return undefined
}

/** Every identifier in a line, as offsets within that line. */
export function* all(text: string): Generator<{ from: number; name: string; to: number }> {
  word.lastIndex = 0
  for (let match = word.exec(text); match; match = word.exec(text))
    yield { from: match.index, name: match[0], to: match.index + match[0].length }
}

/** Returns the target column of a `^?` line, or `undefined`. */
export function caretColumn(text: string): number | undefined {
  const match = /^(\s*\/\/\s*)\^\?\s*$/.exec(text)
  return match ? (match[1]?.length ?? 0) : undefined
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
