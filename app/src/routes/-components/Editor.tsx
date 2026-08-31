import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, tooltips } from '@codemirror/view'
import * as stylex from '@stylexjs/stylex'
import type { Theme } from 'monoshot'
import type { Twoslash } from 'monoshot'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { completions } from '#/lib/editor/completions.js'
import { highlight, setTokens } from '#/lib/editor/highlight.js'
import type { Token } from '#/lib/editor/highlight.js'
import { hover } from '#/lib/editor/hover.js'
import { indent } from '#/lib/editor/indent.js'
import { bare, notations, syntax } from '#/lib/editor/notations.js'
import { rail } from '#/lib/editor/rail.js'
import { overlooked, pins, problems } from '#/lib/editor/problems.js'
import { query as queries, setPending } from '#/lib/editor/query.js'
import { theme } from '#/lib/editor/theme.js'
import * as Types from '#/lib/editor/types.js'
import type { Completion } from '#/lib/twoslash/protocol.js'

import { Frame } from './Frame.js'

/** Held still, so the editor is not rebuilt with a fresh array each render. */
const none: readonly number[] = []

const styles = stylex.create({
  root: {
    // Metrics live in the shared `--code-*` properties; only the box is here.
    paddingBlock: 12,
  },
})

/** The editable code surface. Colored from shiki tokens, not a CM6 grammar. */
export function Editor(props: Editor.Props) {
  const {
    code,
    diagnostics,
    language,
    onCodeChange,
    onComplete,
    onIgnore,
    palette,
    tokens,
    types,
    typesPending,
  } = props

  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  // Held in a ref so changing the handler never rebuilds the editor.
  const onChange = useRef(onCodeChange)
  onChange.current = onCodeChange
  const complete = useRef(onComplete)
  complete.current = onComplete
  const ignored = useRef(onIgnore)
  ignored.current = onIgnore
  // Ignoring a diagnostic changes editor state without changing the document.
  const [overlooking, setOverlooking] = useState<readonly number[]>(none)
  const overlays = useRef(new Compartment()).current
  const palettes = useRef(new Compartment()).current
  const rails = useRef(new Compartment()).current
  // Where the controls beside a line are drawn: outside the window, which clips.
  const aside = useContext(Frame.Aside)

  useEffect(() => {
    const parent = host.current
    if (!parent) return
    const instance = new EditorView({
      parent,
      state: EditorState.create({
        doc: code,
        extensions: [
          history(),
          indent,
          // The generic bracket set leaves out the backtick, so a template
          // literal would open without closing. Supplied as language data
          // because the editor has no grammar to carry it.
          EditorState.languageData.of(() => [
            { closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`'] } },
          ]),
          closeBrackets(),
          // Ahead of the defaults: backspacing between a freshly typed pair
          // takes both, which the plain delete binding would not.
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          // Copy the rendered source without notation directives.
          EditorView.clipboardOutputFilter.of((text) => bare(text)),
          // Without a name the code surface reads as an unlabelled edit field.
          EditorView.contentAttributes.of({ 'aria-label': 'Code' }),
          highlight,
          notations,
          pins,
          // Diagnostics are supplied externally, so only linter configuration is needed.
          // Suppress built-in tooltips when the custom hover can present the diagnostic.
          linter(null, {
            tooltipFilter: (found, state) =>
              found.filter((diagnostic) => !Types.over(state, diagnostic)),
          }),
          overlays.of(tooltips(aside ? { parent: aside } : {})),
          rails.of(rail({ container: aside, syntax: syntax(language) })),
          queries(typesPending),
          hover,
          completions((document, position) => complete.current(document, position)),
          palettes.of(theme(palette)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange.current(update.state.doc.toString())
            const ignoredOffsets = overlooked(update.state)
            const before = overlooked(update.startState)
            // Compare offsets because mapping through an edit creates a new array.
            if (
              ignoredOffsets.length === before.length &&
              ignoredOffsets.every((at, i) => at === before[i])
            )
              return
            setOverlooking(ignoredOffsets)
            ignored.current(ignoredOffsets)
          }),
        ],
      }),
    })
    view.current = instance
    return () => {
      view.current = null
      instance.destroy()
    }
    // Built once: the document and palette are pushed in below rather than
    // rebuilding the editor and losing the cursor on every keystroke.
  }, [])

  useEffect(() => {
    view.current?.dispatch({
      effects: overlays.reconfigure(tooltips(aside ? { parent: aside } : {})),
    })
  }, [aside, overlays])

  useEffect(() => {
    view.current?.dispatch({ effects: palettes.reconfigure(theme(palette)) })
  }, [palette, palettes])

  useEffect(() => {
    view.current?.dispatch({
      effects: rails.reconfigure(rail({ container: aside, syntax: syntax(language) })),
    })
  }, [aside, language, rails])

  useEffect(() => {
    view.current?.dispatch({ effects: Types.setTypes.of(types) })
  }, [types])

  // A layout effect prevents the source query flashing for one frame while a
  // newly edited document waits for compiler-backed types.
  useLayoutEffect(() => {
    view.current?.dispatch({ effects: setPending.of(typesPending) })
  }, [typesPending])

  // After the document below would be wrong: a diagnostic clamped against the
  // previous text would land on the wrong words for a frame.
  useEffect(() => {
    const instance = view.current
    if (instance) instance.dispatch(problems(instance.state, diagnostics))
  }, [diagnostics, overlooking])

  // A code change from outside, such as restoring a shared snippet.
  useEffect(() => {
    const instance = view.current
    if (!instance || instance.state.doc.toString() === code) return
    instance.dispatch({
      changes: { from: 0, insert: code, to: instance.state.doc.length },
    })
  }, [code])

  // After the document above, never before: tokens built against a restored
  // snippet would map through its own replacement and vanish.
  useEffect(() => {
    view.current?.dispatch({ effects: setTokens.of(tokens) })
  }, [tokens])

  return <div ref={host} {...stylex.props(styles.root)} />
}

export declare namespace Editor {
  /** Props for {@link Editor}. */
  type Props = {
    /** The document. Changing it from outside replaces the editor's content. */
    code: string
    /** What the compiler objected to, drawn as squiggles. */
    diagnostics: readonly Twoslash.Diagnostic[]
    /** What the snippet is written in, which decides how a mark is written. */
    language: string
    /** Receives every edit. */
    onCodeChange: (code: string) => void
    /** Receives the offsets of ignored diagnostics. */
    onIgnore: (offsets: readonly number[]) => void
    /** Requests completion entries at the caret. */
    onComplete: (code: string, position: number) => Promise<readonly Completion[]>
    /** Colors the editor to match the frame it sits in. */
    palette: Theme.derive.Result
    /** Types by identifier, shown on hover and under a pinned `^?` caret. */
    types: Types.Types
    /** Whether pinned type queries are waiting for compiler-backed results. */
    typesPending: boolean
    /** Shiki tokens for the current document, one array per line. */
    tokens: readonly (readonly Token[])[]
  }
}
