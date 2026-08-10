import { RangeSet, StateField } from '@codemirror/state'
import type { ChangeSpec, EditorState, Extension } from '@codemirror/state'
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
    // A hidden notation still holds its characters, so without this the caret
    // walks into one and Backspace corrupts it unseen.
    EditorView.atomicRanges.of((view) => view.state.field(self).hidden),
  ],
})

/** What a notation asks a line to look like. */
export type Kind = 'add' | 'focus' | 'highlight' | 'remove'

/** A notation, the lines it marks, and where its comment sits in the source. */
export type Notation = {
  /** Whether the comment stands on a line of its own. */
  alone: boolean
  from: number
  kind: Kind
  lines: readonly number[]
  to: number
}

/**
 * The comment a notation is written as. Every language the frame highlights
 * writes one of these, and shiki reads all four.
 */
export type Syntax = { close?: string | undefined; open: string }

/** Languages writing a block comment and no line comment. */
const blocks: Readonly<Record<string, Syntax>> = {
  css: { close: '*/', open: '/*' },
  html: { close: '-->', open: '<!--' },
  less: { close: '*/', open: '/*' },
  markdown: { close: '-->', open: '<!--' },
  md: { close: '*/', open: '/*' },
  scss: { close: '*/', open: '/*' },
  svg: { close: '-->', open: '<!--' },
  vue: { close: '-->', open: '<!--' },
  xml: { close: '-->', open: '<!--' },
}

/** Languages writing a line comment with `#`. */
const hashes = new Set([
  'bash',
  'cmake',
  'coffee',
  'crystal',
  'dockerfile',
  'elixir',
  'fish',
  'julia',
  'make',
  'nim',
  'nix',
  'perl',
  'powershell',
  'python',
  'r',
  'ruby',
  'sh',
  'shellscript',
  'tcl',
  'toml',
  'yaml',
  'zsh',
])

/**
 * The comment a notation is written as for a language. Most of what the frame
 * highlights is C-like, which is what anything unlisted falls back to.
 */
export function syntax(language: string): Syntax {
  return blocks[language] ?? (hashes.has(language) ? { open: '#' } : { open: '//' })
}

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

/** How each kind is written back into the source. */
const names: Readonly<Record<Kind, string>> = {
  add: '++',
  focus: 'focus',
  highlight: 'hl',
  remove: '--',
}

/**
 * Draws the marks a snippet carries while it is being written, so the editor
 * shows what the exported image will show.
 *
 * The comment goes out of view the moment it reads as a notation, the way a
 * `^?` line does: it is the mark rather than something to look at. The controls
 * beside the line take it away again, and Backspace at the line's end takes the
 * whole of it in one step.
 */
export const notations: Extension = field

/** The notations covering a line, in source order. */
export function at(state: EditorState, line: number): readonly Notation[] {
  const found = state.field(field, false)?.notations ?? []
  return found.filter((notation) => notation.lines.includes(line))
}

/**
 * Lines holding nothing but a notation, which the export removes. The editor
 * skips their numbers so both surfaces count the code the same way.
 */
export function removed(state: EditorState): readonly number[] {
  return state.field(field, false)?.removed ?? []
}

/**
 * Turns a mark on or off for a line. A notation reaching further than the line
 * goes entirely rather than shrinking: a count is what its writer asked for, and
 * halving it is not.
 */
export function toggle(
  state: EditorState,
  options: { kind: Kind; line: number; syntax: Syntax },
): ChangeSpec {
  const { kind, line, syntax } = options
  const carried = at(state, line).find((notation) => notation.kind === kind)
  if (!carried) {
    const { to } = state.doc.line(line)
    const close = syntax.close ? ` ${syntax.close}` : ''
    return { from: to, insert: ` ${syntax.open} [!code ${names[kind]}]${close}` }
  }
  const text = state.doc.lineAt(carried.from)
  // The gap the comment sat behind goes too, so the code does not end in one.
  if (!carried.alone) {
    const code = state.doc.sliceString(text.from, carried.from).replace(/[ \t]+$/, '')
    return { from: text.from + code.length, to: carried.to }
  }
  // A comment standing alone leaves an empty line behind unless a line break
  // goes with it.
  if (text.to < state.doc.length) return { from: text.from, to: text.to + 1 }
  return { from: Math.max(0, text.from - 1), to: text.to }
}

type Value = {
  decorations: DecorationSet
  gutter: RangeSet<GutterMarker>
  /** The ranges standing in for a notation, which the caret steps over. */
  hidden: DecorationSet
  notations: readonly Notation[]
  removed: readonly number[]
}

function build(state: EditorState): Value {
  const { doc } = state
  const marked = new Map<number, Set<Kind>>()
  const found: Notation[] = []
  const ranges = []
  const concealed = []
  const cells = []
  const removed: number[] = []
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number)
    const match = pattern.exec(line.text)
    const kind = match?.[2] && kinds[match[2]]
    if (!match || !kind) continue
    const at = match.index
    // A notation on a line of its own addresses what follows it; one trailing
    // code addresses the line it sits on.
    const alone = line.text.slice(0, at).trim() === ''
    if (alone) removed.push(number)
    const first = alone ? number + 1 : number
    const count = Number(match[3] ?? 1)
    const covered = []
    for (let target = first; target < first + count; target++)
      if (target <= doc.lines) {
        covered.push(target)
        marked.set(target, (marked.get(target) ?? new Set()).add(kind))
      }
    found.push({ alone, from: line.from + at, kind, lines: covered, to: line.to })
    concealed.push(conceal(state, { alone, at, line }))
  }
  const focused = [...marked].some(([, kinds]) => kinds.has('focus'))
  for (let number = 1; number <= doc.lines; number++) {
    const kinds = marked.get(number)
    const { from } = doc.line(number)
    // A line carrying a mark of its own keeps it: the mark is the louder claim.
    if (focused && !kinds?.size) {
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
    decorations: Decoration.set([...ranges, ...concealed], true),
    gutter: RangeSet.of(cells, true),
    hidden: Decoration.set(concealed, true),
    notations: found,
    removed,
  }
}

/**
 * The range a notation comment stops occupying. One standing alone takes a line
 * break with it, so the line closes up rather than staying blank.
 */
function conceal(
  state: EditorState,
  options: { alone: boolean; at: number; line: { from: number; to: number } },
) {
  const { alone, at, line } = options
  if (!alone) {
    // The gap the comment sat behind goes too, so the code does not end in one.
    const code = state.doc.sliceString(line.from, line.from + at).replace(/[ \t]+$/, '')
    return Decoration.replace({}).range(line.from + code.length, line.to)
  }
  // The break before it rather than the one after: a range reaching into the
  // next line swallows the mark that line was given.
  if (line.from > 0) return Decoration.replace({ block: true }).range(line.from - 1, line.to)
  if (line.to < state.doc.length)
    return Decoration.replace({ block: true }).range(line.from, line.to + 1)
  return Decoration.replace({}).range(line.from, line.to)
}

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
