/** A notation asking for a line to read as removed, in any comment syntax. */
const removal = /(?:\/\/|\/\*|#|<!--)[ \t]*\[!code[ \t]+--(?::(\d+))?\][ \t]*(?:\*\/|-->)?/

/**
 * Blanks the lines a snippet marks as removed, keeping every offset it had.
 *
 * The code being replaced is not code the snippet is claiming: checking it
 * alongside its replacement reports the conflict between the two rather than a
 * mistake in either. Blanked rather than cut so a type resolved for what is left
 * still lands where it was found.
 */
export function unchecked(code: string): string {
  const lines = code.split('\n')
  const blanked = new Set<number>()
  for (const [index, line] of lines.entries()) {
    const match = removal.exec(line)
    if (!match) continue
    // A notation alone on a line addresses what follows it; one trailing code
    // addresses the line it sits on.
    const alone = line.replace(removal, '').trim() === ''
    const first = alone ? index + 1 : index
    if (alone) blanked.add(index)
    for (let target = first; target < first + Number(match[1] ?? 1); target++) blanked.add(target)
  }
  if (!blanked.size) return code
  return lines
    .map((line, index) => (blanked.has(index) ? ' '.repeat(line.length) : line))
    .join('\n')
}

/**
 * Takes the ranges out of a string, so a run resolved against blanked code can
 * report the snippet as it was written.
 */
export function cut(code: string, ranges: readonly (readonly [number, number])[]): string {
  let at = 0
  let out = ''
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (from < at) continue
    out += code.slice(at, from)
    at = to
  }
  return out + code.slice(at)
}
