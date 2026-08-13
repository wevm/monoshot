import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'

/** An npm package imported by the document. */
export type Reference = {
  /** Offset where the package specifier starts. */
  from: number
  /** Bare package name, without its imported subpath. */
  name: string
  /** Offset after the package specifier. */
  to: number
}

/** Package versions selected in the editor, keyed by bare package name. */
export type Versions = Readonly<Record<string, string>>

type Value = {
  decorations: DecorationSet
  loading: readonly string[]
  references: readonly Reference[]
}

/** Carries the packages currently loading into the editor. */
export const setLoading = StateEffect.define<readonly string[]>()

/** Tracks package imports and decorates the ones whose declarations are loading. */
export const packages = StateField.define<Value>({
  create: (state) => build(state.doc, []),
  update(value, transaction) {
    let loading = value.loading
    for (const effect of transaction.effects) if (effect.is(setLoading)) loading = effect.value
    return transaction.docChanged || loading !== value.loading
      ? build(transaction.state.doc, loading)
      : value
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

/** Returns the imported npm package named on a source line. */
export function at(state: EditorState, line: number): Reference | undefined {
  const source = state.doc.line(line)
  return state
    .field(packages)
    .references.find((reference) => reference.from >= source.from && reference.to <= source.to)
}

/** Finds npm package specifiers in static imports, exports, and calls. */
export function references(code: string): readonly Reference[] {
  const found: Reference[] = []
  const pattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\w*{}, \t\r\n]+?\s+from\s+)?(['"])([^'"\r\n]+)\1|\b(?:import|require)\s*\(\s*(['"])([^'"\r\n]+)\3\s*\)/g
  for (const match of code.matchAll(pattern)) {
    const specifier = match[2] ?? match[4]
    if (!specifier || match.index === undefined) continue
    const name = bare(specifier)
    if (!name) continue
    const from = match.index + match[0].lastIndexOf(specifier)
    found.push({ from, name, to: from + specifier.length })
  }
  return found
}

function build(doc: Text, loading: readonly string[]): Value {
  const imported = references(doc.toString())
  const active = new Set(loading)
  const lines = new Map<number, string[]>()
  for (const reference of imported) {
    if (!active.has(reference.name)) continue
    const end = doc.lineAt(reference.to).to
    const names = lines.get(end) ?? []
    names.push(reference.name)
    lines.set(end, names)
  }
  const decorations = Decoration.set(
    [...lines].map(([to, names]) =>
      Decoration.widget({ side: 1, widget: new Loading(names) }).range(to),
    ),
    true,
  )
  return { decorations, loading, references: imported }
}

/** `shiki/core` belongs to `shiki`; a scoped package keeps two segments. */
function bare(specifier: string) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    specifier.startsWith('node:') ||
    /^[a-z]+:/i.test(specifier)
  )
    return undefined
  const parts = specifier.split('/')
  if (specifier.startsWith('@')) return parts.length >= 2 ? parts.slice(0, 2).join('/') : undefined
  return parts[0] || undefined
}

class Loading extends WidgetType {
  constructor(readonly names: readonly string[]) {
    super()
  }

  override eq(other: Loading) {
    return (
      this.names.length === other.names.length &&
      this.names.every((name, index) => name === other.names[index])
    )
  }

  override toDOM() {
    const label = `Loading types for ${this.names.join(', ')}`
    const root = document.createElement('span')
    root.className = 'package-loading'
    root.setAttribute('aria-label', label)
    root.setAttribute('role', 'status')
    root.title = label
    root.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
    return root
  }
}
