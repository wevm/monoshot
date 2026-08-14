import { tags } from './Tags.js'

/** A notation asking for a line to read as removed, in any comment syntax. */
const removal = /(?:\/\/|\/\*|#|<!--)[ \t]*\[!code[ \t]+--(?::(\d+))?\][ \t]*(?:\*\/|-->)?/

/** Any notation, which is what a line carries besides the code on it. */
const notation = /(?:\/\/|\/\*|#|<!--)[ \t]*\[!code[ \t]+[\w+-]+(?::\d+)?\][ \t]*(?:\*\/|-->)?/g

/** Tag prefix Twoslash would otherwise remove before Monoshot can render it. */
const tag = new RegExp(`^//[ \\t]?@(?=(?:${tags.join('|')}):)`, 'gm')

/**
 * Blanks removed lines and hides presentation tags from the compiler, keeping
 * every offset the snippet had.
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
    // A standalone notation applies to following lines; a trailing notation
    // applies to its own line. Remove every notation from a notation-only line.
    const alone = line.replace(notation, '').trim() === ''
    const first = alone ? index + 1 : index
    if (alone) blanked.add(index)
    // Clamp the requested range to existing lines to prevent unbounded work
    // from excessively large notation counts.
    for (let target = first; target < Math.min(first + count(match[1]), lines.length); target++)
      blanked.add(target)
  }
  const prepared = blanked.size
    ? lines.map((line, index) => (blanked.has(index) ? ' '.repeat(line.length) : line)).join('\n')
    : code
  // Twoslash collapses adjacent custom tags into one removal and retains only
  // the final node. Mask the sigil for compilation; the original source is
  // restored after resolution and Monoshot renders every tag itself.
  return prepared.replace(tag, (prefix) => `${prefix.slice(0, -1)} `)
}

/** How many lines a notation covers, as a count this can count to. */
function count(written: string | undefined): number {
  const asked = Number(written ?? 1)
  return Number.isSafeInteger(asked) && asked > 0 ? asked : 1
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
