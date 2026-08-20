import { StateField } from '@codemirror/state'
import type { ChangeSpec, EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { Twoslash } from 'monoshot'

import * as Identifier from './identifier.js'

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

/** Visual treatment applied by a notation. */
export type Kind = 'add' | 'focus' | 'highlight' | 'remove'

/** Prose annotation rendered as its own row above code. */
export type Tag = (typeof Twoslash.tags)[number]

/** A notation, the lines it marks, and where its comment sits in the source. */
export type Notation = {
  /** Whether the comment stands on a line of its own. */
  alone: boolean
  /** Where the comment starts, as a document offset. */
  from: number
  /** Visual treatment applied to the selected lines. */
  kind: Kind
  /** The lines it marks, numbered from one as the document numbers them. */
  lines: readonly number[]
  /** Exclusive end offset of the comment. */
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

/** Languages writing a line comment with something other than `//` or `#`. */
const dashes = new Set(['haskell', 'lua', 'sql'])
const semicolons = new Set(['clojure', 'lisp'])
const percents = new Set(['erlang', 'latex', 'matlab'])

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
  const found = blocks[language]
  if (found) return found
  if (hashes.has(language)) return { open: '#' }
  if (dashes.has(language)) return { open: '--' }
  if (semicolons.has(language)) return { open: ';' }
  if (percents.has(language)) return { open: '%' }
  // Anything unlisted is C-like, which most of what the picker offers is.
  return { open: '//' }
}

/**
 * A notation comment in the snippet language's comment syntax. A suffix such
 * as `[!code hl:3]` sets the number of affected lines.
 *
 * Match every notation on the line because Shiki processes all of them. A line
 * carrying two would otherwise show one of them as code.
 */
const pattern =
  /(?:\/\/|\/\*|#|<!--|--|;|%)[ \t]*\[!code[ \t]+([\w+-]+)(?::(\d+))?\][ \t]*(?:\*\/|-->)?/g

/**
 * Matches a Twoslash annotation tag. The editor and exporter both read the
 * published tag list.
 */
const tagPattern = new RegExp(
  `^[ \\t]*(?://|#|--|;|%|/\\*|<!--)[ \\t]*@(${Twoslash.tags.join('|')}):[ \\t]?`,
)

/** How a block comment ends, which a tag written in one carries. */
const closing = /[ \t]*(?:\*\/|-->)[ \t]*$/

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

/**
 * The snippet without what was written to mark it: the notations, the tags, and
 * the caret lines asking for a type.
 *
 * Clipboard output contains source code without rendering directives.
 */
export function bare(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      if (tagPattern.test(line) || Identifier.caretColumn(line) !== undefined) return false
      // Remove notation-only lines while preserving intentional blank lines.
      return line.trim() === '' || line.replace(pattern, '').trim() !== ''
    })
    .map((line) => {
      const written = line.replace(pattern, '')
      return written === line ? line : written.replace(/[ \t]+$/, '')
    })
    .join('\n')
}

/** The notations covering a line, in source order. */
export function at(state: EditorState, line: number): readonly Notation[] {
  const found = state.field(field, false)?.notations ?? []
  return found.filter((notation) => notation.lines.includes(line))
}

/** The tag carried by a comment line. */
export function tagAt(state: EditorState, line: number): Tag | undefined {
  return parseTag(state.doc.line(line).text)
}

/** Whether a row is a standalone comment that can become a prose tag. */
export function takesTag(state: EditorState, line: number, syntax: Syntax): boolean {
  const text = state.doc.line(line).text.trim()
  if (!text.startsWith(syntax.open)) return false
  if (syntax.close && !text.endsWith(syntax.close)) return false
  return text.match(pattern) === null && Identifier.caretColumn(text) === undefined
}

/**
 * Whether a line can carry a mark. A blank one cannot: a comment alone on a line
 * addresses the line after it, and is taken out along with the line it sat on.
 * Nor can a line that is already only a notation, which is not code either.
 */
export function takesMark(state: EditorState, line: number): boolean {
  const { text } = state.doc.line(line)
  // A tag is prose about the code and a `^?` is a question about it: neither is
  // a line a mark reads on, and a marker written into one stays as it was typed.
  if (tagPattern.test(text) || Identifier.caretColumn(text) !== undefined) return false
  return text.replace(pattern, '').trim() !== ''
}

/**
 * Lines containing only a notation, which exports remove. The editor
 * skips their numbers so both surfaces count the code the same way.
 */
export function removed(state: EditorState): readonly number[] {
  return state.field(field, false)?.removed ?? []
}

/**
 * Toggles a line mark. Add, remove, and highlight are mutually exclusive;
 * focus can coexist because it controls visibility rather than mark style.
 *
 * Removes a multi-line notation instead of changing its requested range.
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
  // A mark of this line's own axis, written above it, goes from there. Taken as
  // whole lines rather than one comment at a time: two on neighbouring lines
  // each include the intervening line break and cannot safely overlap.
  const changes: ChangeSpec[] = emptied(
    state,
    carried
      .filter((notation) => notation.alone && notation.kind !== 'focus')
      .map((notation) => state.doc.lineAt(notation.from).number),
  )
  // Only the marks of this line's own axis come off. A comment this does not
  // recognize is the writer's, and a focus written here is a different question
  // from what the line is marked as: neither is this press's to delete.
  const code = text.text
    .replaceAll(pattern, (match, name: string) =>
      kinds[name] && kinds[name] !== 'focus' ? '' : match,
    )
    .replace(/[ \t]+$/, '')
  changes.push({ from: text.from, to: text.to, insert: own ? code : `${code} ${comment(kind)}` })
  return changes

  function comment(kind: Kind) {
    const close = syntax.close ? ` ${syntax.close}` : ''
    return `${syntax.open} [!code ${names[kind]}]${close}`
  }
}

/** Adds, changes, or removes the tag on a comment line. */
export function toggleTag(
  state: EditorState,
  options: { line: number; syntax: Syntax; tag: Tag },
): ChangeSpec {
  const { line, syntax, tag } = options
  const target = state.doc.line(line)
  const open = target.text.indexOf(syntax.open) + syntax.open.length
  const found = tagPattern.exec(target.text)
  if (!found) {
    const following = target.text.slice(open)
    const gap = following.startsWith(' ') ? '' : ' '
    return { from: target.from + open, insert: ` @${tag}:${gap}` }
  }
  const from = target.from + open
  const to = target.from + found[0].length
  if (found[1] !== tag) return { from, to, insert: ` @${tag}: ` }
  const following = target.text.slice(found[0].length)
  return { from, to, insert: following ? ' ' : '' }
}

/**
 * The lines taken away, one range per run of neighbours: a run takes a single
 * line break with it however many lines it holds.
 */
function emptied(state: EditorState, lines: readonly number[]) {
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const runs: number[][] = []
  for (const number of sorted) {
    const last = runs.at(-1)
    if (last && number === (last.at(-1) as number) + 1) last.push(number)
    else runs.push([number])
  }
  return runs.map((run) => {
    const first = state.doc.line(run[0] as number)
    const last = state.doc.line(run.at(-1) as number)
    // The break before the run rather than the one after, which the line this
    // leaves behind is rewritten from.
    if (first.from > 0) return { from: first.from - 1, to: last.to }
    if (last.to < state.doc.length) return { from: first.from, to: last.to + 1 }
    return { from: first.from, to: last.to }
  })
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
  const tagged = new Set<number>()
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number)
    const tag = tagPattern.exec(line.text)
    if (tag) {
      // What names the tag is not part of what it says, so it reads as the
      // prose the export draws rather than as a comment.
      concealed.push(Decoration.replace({}).range(line.from, line.from + tag[0].length))
      // A tag written in a block comment closes it, and the closer is no more
      // part of the prose than the opener is.
      const closed = closing.exec(line.text)
      if (closed)
        concealed.push(
          Decoration.replace({}).range(line.from + closed.index, line.from + line.text.length),
        )
      ranges.push(Decoration.line({ class: `cm-tag-${tag[1]}` }).range(line.from))
      tagged.add(number)
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
    // Held to the lines there are: a snippet asking for a billion of them, or
    // for so many that the count reads as infinite, is asking the editor to
    // trigger repeated decoration rebuilds.
    const last = Math.min(first + count(match[2]) - 1, doc.lines)
    const covered = []
    for (let target = first; target <= last; target++) {
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
    // Preserve an explicit line mark when focus also applies.
    // A tag is prose about the code rather than code that fell out of focus,
    // and exports always render it at full opacity.
    if (focused && !kinds?.size && !tagged.has(number)) {
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

function parseTag(text: string): Tag | undefined {
  return tagPattern.exec(text)?.[1] as Tag | undefined
}

/**
 * The source ranges occupied by a line's notations. A notation-only line
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
  // Hide the row contents without replacing adjacent line breaks, which belong
  // to the surrounding source lines.
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

/** How many lines a notation covers, as a count the editor can count to. */
function count(written: string | undefined): number {
  const asked = Number(written ?? 1)
  return Number.isSafeInteger(asked) && asked > 0 ? asked : 1
}

/** A notation-only row that is excluded from rendered code. */
const gone = Decoration.line({ class: 'cm-gone' })

const lines = new Map<string, Decoration>()

function line(kind: Kind | 'blur'): Decoration {
  const cached = lines.get(kind)
  if (cached) return cached
  const created = Decoration.line({ class: `cm-mark-${kind}` })
  lines.set(kind, created)
  return created
}
