import { RangeSet, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, gutterLineClass } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

const field = StateField.define<Value>({
  create: (state) => build(state),
  update: (value, transaction) => (transaction.docChanged ? build(transaction.state) : value),
  provide: (self) => [
    EditorView.decorations.from(self, (value) => value.decorations),
    // The gutter is a column of its own, so a mark that stops at the code
    // would start beside the numbers rather than at the window's edge.
    gutterLineClass.from(self, (value) => value.gutter),
  ],
})

/** What a notation asks a line to look like. */
export type Kind = 'add' | 'focus' | 'highlight' | 'remove'

/**
 * A notation comment, in the comment syntax of whatever the snippet is written
 * in. The count suffix, as in `[!code hl:3]`, is how many lines it covers.
 */
const pattern = /(\/\/|\/\*|#|<!--)\s*\[!code\s+([\w+-]+)(?::(\d+))?\]\s*(?:\*\/|-->)?[ \t]*$/

const kinds: Readonly<Record<string, Kind>> = {
  '++': 'add',
  '--': 'remove',
  focus: 'focus',
  highlight: 'highlight',
  hl: 'highlight',
}

/**
 * Draws the marks a snippet carries while it is being written, so the editor
 * shows what the exported image will show.
 *
 * The comment stays where it is rather than being hidden: it is source the
 * writer is editing, and the only handle they have on the mark. Export takes
 * it back out.
 */
export const notations: Extension = field

/**
 * Lines holding nothing but a notation, which the export removes. The editor
 * skips their numbers so both surfaces count the code the same way.
 */
export function removed(state: EditorState): readonly number[] {
  return state.field(field, false)?.removed ?? []
}

type Value = {
  decorations: DecorationSet
  gutter: RangeSet<GutterMarker>
  removed: readonly number[]
}

function build(state: EditorState): Value {
  const { doc } = state
  const marked = new Map<number, Set<Kind>>()
  const ranges = []
  const cells = []
  const removed: number[] = []
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number)
    const match = pattern.exec(line.text)
    const kind = match?.[2] && kinds[match[2]]
    if (!match || !kind) continue
    const at = match.index
    ranges.push(comment.range(line.from + at, line.to))
    // A notation on a line of its own addresses what follows it; one trailing
    // code addresses the line it sits on.
    const alone = line.text.slice(0, at).trim() === ''
    if (alone) removed.push(number)
    const first = alone ? number + 1 : number
    const count = Number(match[3] ?? 1)
    for (let target = first; target < first + count; target++)
      if (target <= doc.lines)
        (marked.get(target) ?? marked.set(target, new Set()).get(target))?.add(kind)
  }
  const focused = [...marked].some(([, kinds]) => kinds.has('focus'))
  for (let number = 1; number <= doc.lines; number++) {
    const kinds = marked.get(number)
    // Focus says which lines matter, so the rest recede rather than being
    // marked themselves.
    const { from } = doc.line(number)
    if (focused && !kinds?.has('focus')) {
      ranges.push(line('blur').range(from))
      cells.push(cell('blur').range(from))
    }
    if (!kinds) continue
    for (const kind of kinds) {
      ranges.push(line(kind).range(from))
      cells.push(cell(kind).range(from))
    }
  }
  return {
    decorations: Decoration.set(ranges, true),
    gutter: RangeSet.of(cells, true),
    removed,
  }
}

const comment = Decoration.mark({ class: 'cm-notation' })

const lines = new Map<string, Decoration>()
const cells = new Map<string, GutterMarker>()

function line(kind: Kind | 'blur'): Decoration {
  const cached = lines.get(kind)
  if (cached) return cached
  const created = Decoration.line({ class: `cm-mark-${kind}` })
  lines.set(kind, created)
  return created
}

function cell(kind: Kind | 'blur'): GutterMarker {
  const cached = cells.get(kind)
  if (cached) return cached
  const created = new (class extends GutterMarker {
    override elementClass = `cm-mark-${kind}`
  })()
  cells.set(kind, created)
  return created
}
