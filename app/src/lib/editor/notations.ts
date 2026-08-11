import { StateField } from '@codemirror/state'
import type { ChangeSpec, EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

const field = StateField.define<Value>({
  create: (state) => build(state),
  update: (value, transaction) => (transaction.docChanged ? build(transaction.state) : value),
  provide: (self) => [
    EditorView.decorations.from(self, (value) => value.decorations),
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
 *
 * Every one on the line, not just the last: shiki reads them all, so a line
 * carrying two would otherwise show one of them as code.
 */
const pattern = /(?:\/\/|\/\*|#|<!--)[ \t]*\[!code[ \t]+([\w+-]+)(?::(\d+))?\][ \t]*(?:\*\/|-->)?/g

/**
 * A twoslash tag, which is prose the snippet carries about the line after it.
 * The export draws it as a row of its own; here it stays where it was written.
 */
const tags = /^[ \t]*(?:\/\/|#|\/\*)[ \t]*@(annotate|error|log|warn):[ \t]?/

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
 * Whether a line can carry a mark. A blank one cannot: a comment alone on a line
 * addresses the line after it, and is taken out along with the line it sat on.
 */
export function takesMark(state: EditorState, line: number): boolean {
  return state.doc.line(line).text.trim() !== ''
}

/**
 * Lines holding nothing but a notation, which the export removes. The editor
 * skips their numbers so both surfaces count the code the same way.
 */
export function removed(state: EditorState): readonly number[] {
  return state.field(field, false)?.removed ?? []
}

/**
 * Turns a mark on or off for a line. A line reads as one thing at a time, so
 * setting one takes off what it carried, except for focus: whether a line is
 * one of the ones that matter is a different question from what it is marked as.
 *
 * A notation reaching further than the line goes entirely rather than shrinking:
 * a count is what its writer asked for, and halving it is not.
 */
export function toggle(
  state: EditorState,
  options: { kind: Kind; line: number; syntax: Syntax },
): ChangeSpec {
  const { kind, line, syntax } = options
  const carried = at(state, line)
  const own = carried.find((notation) => notation.kind === kind)
  const text = state.doc.line(line)
  // Focus stands on a line of its own, so a line can be focused and marked at
  // once: shiki reads one notation per line, and two would cost it one of them.
  if (kind === 'focus')
    return own ? away(state, own) : { from: text.from, insert: `${comment(kind)}\n` }
  const changes: ChangeSpec[] = []
  // A mark of this line's own axis, written above it, goes from there.
  for (const notation of carried)
    if (notation.alone && notation.kind !== 'focus') changes.push(away(state, notation))
  const code = text.text.replace(pattern, '').replace(/[ \t]+$/, '')
  changes.push({ from: text.from, to: text.to, insert: own ? code : `${code} ${comment(kind)}` })
  return changes

  function comment(kind: Kind) {
    const close = syntax.close ? ` ${syntax.close}` : ''
    return `${syntax.open} [!code ${names[kind]}]${close}`
  }
}

/**
 * The notation, taken away: one standing alone takes a line break with it, and
 * one trailing code takes the gap it sat behind.
 */
function away(state: EditorState, notation: Notation) {
  const text = state.doc.lineAt(notation.from)
  if (!notation.alone) {
    const code = state.doc.sliceString(text.from, notation.from).replace(/[ \t]+$/, '')
    return { from: text.from + code.length, to: notation.to }
  }
  // The break before it rather than the one after, which the line this leaves
  // behind is rewritten from.
  if (text.from > 0) return { from: text.from - 1, to: text.to }
  if (text.to < state.doc.length) return { from: text.from, to: text.to + 1 }
  return { from: text.from, to: text.to }
}

type Value = {
  decorations: DecorationSet
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
  const removed: number[] = []
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number)
    const tag = tags.exec(line.text)
    if (tag) {
      // What names the tag is not part of what it says, so it reads as the
      // prose the export draws rather than as a comment.
      concealed.push(Decoration.replace({}).range(line.from, line.from + tag[0].length))
      ranges.push(Decoration.line({ class: `cm-tag-${tag[1]}` }).range(line.from))
      continue
    }
    const written = [...line.text.matchAll(pattern)].filter((match) => match[1] && kinds[match[1]])
    if (!written.length) continue
    // A notation on a line of its own addresses what follows it; one trailing
    // code addresses the line it sits on.
    const alone = line.text.replace(pattern, '').trim() === ''
    if (alone) removed.push(number)
    // The last of them and no others: shiki reads a line's trailing comment as
    // one notation, so a line carrying two draws only the one at its end. Every
    // one is still taken out of view, since none of them is code.
    const match = written.at(-1) as RegExpExecArray
    const kind = kinds[match[1] as string] as Kind
    const first = alone ? number + 1 : number
    const count = Number(match[2] ?? 1)
    const covered = []
    for (let target = first; target < first + count; target++)
      if (target <= doc.lines) {
        covered.push(target)
        marked.set(target, (marked.get(target) ?? new Set()).add(kind))
      }
    found.push({
      alone,
      from: line.from + match.index,
      kind,
      lines: covered,
      to: line.from + match.index + match[0].length,
    })
    concealed.push(...conceal(state, { alone, line, written }))
    // A row emptied rather than replaced still takes a line's height.
    if (alone) ranges.push(gone.range(line.from))
  }
  const focused = [...marked].some(([, kinds]) => kinds.has('focus'))
  for (let number = 1; number <= doc.lines; number++) {
    const kinds = marked.get(number)
    const { from } = doc.line(number)
    // A line carrying a mark of its own keeps it: the mark is the louder claim.
    if (focused && !kinds?.size) {
      ranges.push(line('blur').range(from))
    }
    if (!kinds) continue
    for (const kind of kinds) {
      ranges.push(line(kind).range(from))
    }
  }
  return {
    decorations: Decoration.set([...ranges, ...concealed], true),
    hidden: Decoration.set(concealed, true),
    notations: found,
    removed,
  }
}

/**
 * The ranges the notations on a line stop occupying. A line holding nothing else
 * takes a line break with it, so it closes up rather than staying blank.
 */
function conceal(
  state: EditorState,
  options: {
    alone: boolean
    line: { from: number; to: number }
    written: readonly RegExpExecArray[]
  },
) {
  const { alone, line, written } = options
  // Emptied and closed by a rule of its own rather than replaced across a line
  // break: the break before it belongs to the line above, which is left with no
  // row of its own when it holds nothing, and the break after belongs to the
  // line this marks, which loses its mark along with it.
  if (alone) return [Decoration.replace({}).range(line.from, line.to)]
  // The gap each comment sat behind goes too, so the code does not end in one.
  return written.map((match) => {
    const before = state.doc
      .sliceString(line.from, line.from + match.index)
      .replace(/[ \t]+$/, '').length
    return Decoration.replace({}).range(
      line.from + before,
      line.from + match.index + match[0].length,
    )
  })
}

/** A row holding a notation and nothing else, which is not part of the code. */
const gone = Decoration.line({ class: 'cm-gone' })

const lines = new Map<string, Decoration>()

function line(kind: Kind | 'blur'): Decoration {
  const cached = lines.get(kind)
  if (cached) return cached
  const created = Decoration.line({ class: `cm-mark-${kind}` })
  lines.set(kind, created)
  return created
}
